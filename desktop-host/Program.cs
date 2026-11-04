using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RustCuiTool;

internal static class Program
{
    internal const string AppName = "RustCuiTool";
    internal const string VirtualHost = "rustcuitool.local";

    [STAThread]
    private static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            var appDir = ExtractApp();
            Application.Run(new MainForm(appDir));
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Не удалось запустить RustCuiTool.\n\n" + ex.Message,
                AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    /// <summary>Unpacks the embedded static build into a content-addressed folder.</summary>
    private static string ExtractApp()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("RustCuiTool.app.zip")
            ?? throw new InvalidOperationException("Встроенный ресурс приложения не найден.");

        var hash = Convert.ToHexString(SHA256.HashData(stream))[..16];
        stream.Position = 0;

        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            AppName,
            "app");
        Directory.CreateDirectory(root);

        var appDir = Path.Combine(root, hash);
        var indexPath = Path.Combine(appDir, "index.html");
        if (!File.Exists(indexPath))
        {
            Directory.CreateDirectory(appDir);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);
            archive.ExtractToDirectory(appDir, overwriteFiles: true);
        }

        // Best-effort cleanup of builds from previous versions.
        foreach (var old in Directory.EnumerateDirectories(root))
        {
            if (string.Equals(Path.GetFileName(old), hash, StringComparison.OrdinalIgnoreCase)) continue;
            try { Directory.Delete(old, recursive: true); } catch { /* in use */ }
        }

        return appDir;
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly string _appDir;
    private bool _ready;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public MainForm(string appDir)
    {
        _appDir = appDir;

        Text = Program.AppName;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        Size = new Size(1400, 900);
        BackColor = Color.FromArgb(11, 12, 14);
        KeyPreview = true;

        try
        {
            using var iconStream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("RustCuiTool.icon.ico");
            if (iconStream is not null) Icon = new Icon(iconStream);
        }
        catch
        {
            // A custom icon is optional; the embedded application icon still works.
        }

        _webView.DefaultBackgroundColor = Color.FromArgb(11, 12, 14);
        Controls.Add(_webView);

        Load += async (_, _) => await InitializeAsync();
        KeyDown += OnKeyDown;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            var enabled = 1;
            DwmSetWindowAttribute(Handle, 20, ref enabled, sizeof(int));
        }
        catch
        {
            // Dark title bar is cosmetic and only exists on newer Windows versions.
        }
    }

    private async Task InitializeAsync()
    {
        try
        {
            var userData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Program.AppName,
                "WebView2");
            Directory.CreateDirectory(userData);

            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await _webView.EnsureCoreWebView2Async(environment);

            var core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = true;
            core.Settings.IsStatusBarEnabled = false;

            core.SetVirtualHostNameToFolderMapping(
                Program.VirtualHost,
                _appDir,
                CoreWebView2HostResourceAccessKind.Allow);

            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenExternal(args.Uri);
            };

            core.NavigationStarting += (_, args) =>
            {
                if (IsInternal(args.Uri)) return;
                args.Cancel = true;
                OpenExternal(args.Uri);
            };

            core.DownloadStarting += OnDownloadStarting;
            core.NavigationCompleted += (_, _) => _ready = true;

            core.Navigate($"https://{Program.VirtualHost}/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "Для работы RustCuiTool нужен Microsoft Edge WebView2 Runtime.\n\n" +
                "Установите его с https://developer.microsoft.com/microsoft-edge/webview2/ и запустите RCT.exe снова.",
                Program.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Не удалось открыть интерфейс RustCuiTool.\n\n" + ex.Message,
                Program.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private static bool IsInternal(string uri) =>
        uri.StartsWith($"https://{Program.VirtualHost}/", StringComparison.OrdinalIgnoreCase) ||
        uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase) ||
        uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
        uri.StartsWith("blob:", StringComparison.OrdinalIgnoreCase);

    private static void OpenExternal(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed)) return;
        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps) return;
        try
        {
            Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
        }
        catch
        {
            // Ignore a missing default browser.
        }
    }

    private void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs args)
    {
        var suggested = Path.GetFileName(args.ResultFilePath);
        using var dialog = new SaveFileDialog
        {
            Title = "Сохранить файл",
            FileName = string.IsNullOrWhiteSpace(suggested) ? "export.json" : suggested,
            Filter = "JSON (*.json)|*.json|C# (*.cs)|*.cs|Все файлы (*.*)|*.*",
            OverwritePrompt = true,
        };

        args.Handled = true;
        if (dialog.ShowDialog(this) == DialogResult.OK) args.ResultFilePath = dialog.FileName;
        else args.Cancel = true;
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F5 && _ready)
        {
            _webView.CoreWebView2?.Reload();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
        else if (e.KeyCode == Keys.F12 && _webView.CoreWebView2 is { } core)
        {
            core.OpenDevToolsWindow();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }
}
