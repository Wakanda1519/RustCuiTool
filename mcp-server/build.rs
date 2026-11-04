/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

fn main() {
    #[cfg(windows)]
    {
        let mut resource = winres::WindowsResource::new();
        resource.set_icon("../icon.ico");
        resource.set_manifest(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"#,
        );
        if let Err(error) = resource.compile() {
            println!("cargo:warning=failed to embed Icon.ico into RCT-MCP.exe: {error}");
        }
    }

    println!("cargo:rerun-if-changed=../icon.ico");
    println!("cargo:rerun-if-changed=build.rs");
}
