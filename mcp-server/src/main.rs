/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04.
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

//! RustCuiTool MCP server.
//!
//! Speaks MCP over stdio to an MCP client (Kilo Code, Claude Code, Cursor, …)
//! and forwards every tool call over a local WebSocket to the editor running
//! in RCT.exe. The editor executes the call against the live document, so
//! changes appear instantly and are undoable.
//!
//! Env:
//!   RUSTCUI_BRIDGE_PORT       WebSocket port (default 7331)
//!   RUSTCUI_ALLOWED_ORIGINS   Extra comma-separated browser origins allowed to
//!                             connect, or "*" to allow any (localhost is always
//!                             allowed).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{accept_hdr_async, WebSocketStream};

const DEFAULT_PORT: u16 = 7331;
const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const SERVER_NAME: &str = "rustcui-editor";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
const SUPPORTED_PROTOCOLS: &[&str] = &["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];

type WsSink = SplitSink<WebSocketStream<TcpStream>, Message>;

#[derive(Deserialize)]
struct Defs {
    instructions: String,
    tools: Vec<ToolDef>,
}

#[derive(Deserialize)]
struct ToolDef {
    name: String,
    description: String,
    #[serde(rename = "input_schema")]
    input_schema: Value,
}

#[derive(Debug)]
struct BridgeImage {
    data: String,
    media_type: String,
}

#[derive(Debug)]
struct BridgeResult {
    ok: bool,
    text: String,
    image: Option<BridgeImage>,
}

impl BridgeResult {
    fn error(text: impl Into<String>) -> Self {
        Self {
            ok: false,
            text: text.into(),
            image: None,
        }
    }
}

#[derive(Deserialize)]
struct EditorImage {
    data: String,
    #[serde(rename = "mediaType")]
    media_type: String,
}

#[derive(Deserialize)]
struct EditorMessage {
    #[serde(rename = "type")]
    kind: Option<String>,
    id: Option<String>,
    ok: Option<bool>,
    content: Option<String>,
    image: Option<EditorImage>,
}

struct Bridge {
    sink: Mutex<Option<WsSink>>,
    pending: Mutex<HashMap<String, oneshot::Sender<BridgeResult>>>,
    current: AtomicU64,
    calls: AtomicU64,
    port: u16,
    listen_error: Mutex<Option<String>>,
}

impl Bridge {
    fn new(port: u16) -> Self {
        Self {
            sink: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            current: AtomicU64::new(0),
            calls: AtomicU64::new(0),
            port,
            listen_error: Mutex::new(None),
        }
    }

    fn next_connection_id(&self) -> u64 {
        self.current.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn not_connected_message(&self) -> String {
        format!(
            "RustCuiTool is not connected. Open RCT.exe, go to AI → MCP bridge and enable \"Local\" mode (port {}).",
            self.port
        )
    }

    async fn fail_pending(&self, reason: &str) {
        let mut pending = self.pending.lock().await;
        for (_, tx) in pending.drain() {
            let _ = tx.send(BridgeResult::error(reason));
        }
    }

    async fn call(&self, name: &str, input: Value) -> BridgeResult {
        if let Some(error) = self.listen_error.lock().await.clone() {
            return BridgeResult::error(error);
        }

        if self.sink.lock().await.is_none() {
            return BridgeResult::error(self.not_connected_message());
        }

        let id = format!(
            "{}-{}",
            std::process::id(),
            self.calls.fetch_add(1, Ordering::Relaxed)
        );
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);

        let payload = json!({
            "type": "call",
            "id": id,
            "name": name,
            "input": input,
        });

        {
            let mut slot = self.sink.lock().await;
            let Some(sink) = slot.as_mut() else {
                self.pending.lock().await.remove(&id);
                return BridgeResult::error(self.not_connected_message());
            };
            if let Err(error) = sink.send(Message::Text(payload.to_string().into())).await {
                self.pending.lock().await.remove(&id);
                return BridgeResult::error(format!("Failed to reach the editor: {error}"));
            }
        }

        match tokio::time::timeout(CALL_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => BridgeResult::error(
                "The editor disconnected before answering. Reopen RCT.exe and enable the MCP bridge.",
            ),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                BridgeResult::error("Timed out waiting for the editor.")
            }
        }
    }
}

fn bridge_port() -> u16 {
    std::env::var("RUSTCUI_BRIDGE_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_PORT)
}

fn origin_allowed(origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        // Non-browser local client.
        return true;
    };

    let extras = std::env::var("RUSTCUI_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "https://hammzat.github.io".to_string());
    for extra in extras.split(',') {
        let extra = extra.trim();
        if extra.is_empty() {
            continue;
        }
        if extra == "*" || extra == origin {
            return true;
        }
    }

    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]") | Some("tauri.localhost")
    )
}

async fn start_bridge(bridge: Arc<Bridge>, port: u16) {
    let listener = match TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(error) => {
            let message = if error.kind() == std::io::ErrorKind::AddrInUse {
                format!(
                    "Port {port} is already used by another RCT-MCP.exe (probably started by another MCP client). \
                     Close that client, or set the same free RUSTCUI_BRIDGE_PORT in the editor and in this server."
                )
            } else {
                format!("Could not start the local MCP bridge on port {port}: {error}")
            };
            eprintln!("[rct-mcp] {message}");
            *bridge.listen_error.lock().await = Some(message);
            return;
        }
    };

    eprintln!("[rct-mcp] waiting for the editor on ws://127.0.0.1:{port}");
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let bridge = bridge.clone();
                tokio::spawn(async move {
                    handle_editor(stream, bridge).await;
                });
            }
            Err(error) => eprintln!("[rct-mcp] accept error: {error}"),
        }
    }
}

async fn handle_editor(stream: TcpStream, bridge: Arc<Bridge>) {
    let ws = match accept_hdr_async(stream, |request: &Request, response: Response| {
        let origin = request
            .headers()
            .get("origin")
            .and_then(|value| value.to_str().ok());
        if origin_allowed(origin) {
            Ok(response)
        } else {
            eprintln!(
                "[rct-mcp] rejected connection from origin {}",
                origin.unwrap_or("(none)")
            );
            Err(ErrorResponse::new(Some("Forbidden origin".to_string())))
        }
    })
    .await
    {
        Ok(ws) => ws,
        Err(error) => {
            eprintln!("[rct-mcp] websocket handshake failed: {error}");
            return;
        }
    };

    let connection_id = bridge.next_connection_id();
    let (sink, mut source) = ws.split();

    // Latest editor tab wins. Drop the old socket and fail its in-flight calls.
    {
        let mut slot = bridge.sink.lock().await;
        if let Some(mut old) = slot.take() {
            let _ = old.send(Message::Close(None)).await;
        }
        *slot = Some(sink);
    }
    bridge
        .fail_pending("The editor reconnected before answering. Try the tool call again.")
        .await;
    eprintln!("[rct-mcp] editor connected");

    while let Some(item) = source.next().await {
        match item {
            Ok(Message::Text(text)) => {
                let text: &str = text.as_ref();
                let Ok(message) = serde_json::from_str::<EditorMessage>(text) else {
                    continue;
                };
                if message.kind.as_deref() != Some("result") {
                    continue;
                }
                let Some(id) = message.id else {
                    continue;
                };
                let Some(tx) = bridge.pending.lock().await.remove(&id) else {
                    continue;
                };
                let _ = tx.send(BridgeResult {
                    ok: message.ok.unwrap_or(false),
                    text: message.content.unwrap_or_default(),
                    image: message.image.map(|image| BridgeImage {
                        data: image.data,
                        media_type: image.media_type,
                    }),
                });
            }
            Ok(Message::Binary(data)) => {
                let Ok(text) = std::str::from_utf8(&data) else {
                    continue;
                };
                let Ok(message) = serde_json::from_str::<EditorMessage>(text) else {
                    continue;
                };
                if message.kind.as_deref() != Some("result") {
                    continue;
                }
                let Some(id) = message.id else {
                    continue;
                };
                let Some(tx) = bridge.pending.lock().await.remove(&id) else {
                    continue;
                };
                let _ = tx.send(BridgeResult {
                    ok: message.ok.unwrap_or(false),
                    text: message.content.unwrap_or_default(),
                    image: message.image.map(|image| BridgeImage {
                        data: image.data,
                        media_type: image.media_type,
                    }),
                });
            }
            Ok(Message::Ping(payload)) => {
                let mut slot = bridge.sink.lock().await;
                if bridge.current.load(Ordering::SeqCst) == connection_id {
                    if let Some(sink) = slot.as_mut() {
                        let _ = sink.send(Message::Pong(payload)).await;
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(error) => {
                eprintln!("[rct-mcp] editor socket error: {error}");
                break;
            }
        }
    }

    let is_current = bridge.current.load(Ordering::SeqCst) == connection_id;
    if is_current {
        *bridge.sink.lock().await = None;
        bridge
            .fail_pending("The editor disconnected before answering.")
            .await;
    }
    eprintln!("[rct-mcp] editor disconnected");
}

fn jsonrpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn jsonrpc_error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message.into() },
    })
}

async fn handle_message(message: Value, bridge: &Bridge, defs: &Defs) -> Option<Value> {
    let id = message.get("id").cloned();
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));

    if id.is_none() {
        // Notifications never get a response.
        return None;
    }
    let id = id.unwrap_or(Value::Null);

    match method {
        "initialize" => {
            let requested = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("2025-06-18");
            let protocol = if SUPPORTED_PROTOCOLS.contains(&requested) {
                requested
            } else {
                "2025-06-18"
            };
            Some(jsonrpc_result(
                id,
                json!({
                    "protocolVersion": protocol,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION },
                    "instructions": defs.instructions.clone(),
                }),
            ))
        }
        "ping" => Some(jsonrpc_result(id, json!({}))),
        "tools/list" => {
            let tools: Vec<Value> = defs
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema.clone(),
                    })
                })
                .collect();
            Some(jsonrpc_result(id, json!({ "tools": tools })))
        }
        "tools/call" => {
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !defs.tools.iter().any(|tool| tool.name == name) {
                return Some(jsonrpc_result(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": format!("Unknown tool \"{name}\"") }],
                        "isError": true,
                    }),
                ));
            }
            let input = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let result = bridge.call(name, input).await;
            let mut content = Vec::new();
            if let Some(image) = result.image {
                if image.media_type == "image/png" || image.media_type == "image/jpeg" {
                    content.push(json!({
                        "type": "image",
                        "data": image.data,
                        "mimeType": image.media_type,
                    }));
                }
            }
            content.push(json!({ "type": "text", "text": result.text }));
            Some(jsonrpc_result(
                id,
                json!({ "content": content, "isError": !result.ok }),
            ))
        }
        "resources/list" => Some(jsonrpc_result(id, json!({ "resources": [] }))),
        "prompts/list" => Some(jsonrpc_result(id, json!({ "prompts": [] }))),
        "logging/setLevel" => Some(jsonrpc_result(id, json!({}))),
        "shutdown" => Some(jsonrpc_result(id, Value::Null)),
        _ => Some(jsonrpc_error(
            id,
            -32601,
            format!("Method not found: {method}"),
        )),
    }
}

async fn run_stdio(bridge: Arc<Bridge>, defs: Arc<Defs>) {
    let mut reader = BufReader::new(tokio::io::stdin());
    let mut writer = tokio::io::stdout();
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let response = match serde_json::from_str::<Value>(trimmed) {
                    Ok(message) => handle_message(message, &bridge, &defs).await,
                    Err(error) => Some(jsonrpc_error(
                        Value::Null,
                        -32700,
                        format!("Parse error: {error}"),
                    )),
                };
                if let Some(response) = response {
                    if writer
                        .write_all(response.to_string().as_bytes())
                        .await
                        .is_err()
                    {
                        break;
                    }
                    if writer.write_all(b"\n").await.is_err() {
                        break;
                    }
                    if writer.flush().await.is_err() {
                        break;
                    }
                }
            }
            Err(error) => {
                eprintln!("[rct-mcp] stdin error: {error}");
                break;
            }
        }
    }

    eprintln!("[rct-mcp] stdin closed, exiting");
}

#[tokio::main]
async fn main() {
    let defs: Defs = match serde_json::from_str(include_str!("../../src/lib/ai/tools.json")) {
        Ok(defs) => defs,
        Err(error) => {
            eprintln!("[rct-mcp] failed to parse tools.json: {error}");
            std::process::exit(1);
        }
    };
    let defs = Arc::new(defs);
    let port = bridge_port();
    let bridge = Arc::new(Bridge::new(port));

    tokio::spawn(start_bridge(bridge.clone(), port));
    eprintln!("[rct-mcp] MCP server ready (stdio)");

    run_stdio(bridge, defs).await;
}
