// Phase 0: a thin macOS shell around the local Next.js server.
// It owns the server lifecycle (start on launch, kill on exit) and points the
// webview at 127.0.0.1, so the desktop never depends on a tunnel.
use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 3100;

struct Sidecar(Mutex<Option<Child>>);

fn port_busy(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn healthy(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let req = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 256];
    match stream.read(&mut buf) {
        Ok(n) => {
            let head = String::from_utf8_lossy(&buf[..n]);
            head.starts_with("HTTP/1.1 200") || head.contains(" 200 ")
        }
        Err(_) => false,
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if port_busy(PORT) {
                eprintln!("[yuanying] port {PORT} is already in use; refusing to start");
                std::process::exit(1);
            }

            let resource = app.path().resource_dir()?;
            let runtime = resource.join("runtime");
            let log_dir = app.path().app_log_dir()?;
            create_dir_all(&log_dir)?;
            let log_path = log_dir.join("desktop.log");
            let log = OpenOptions::new().create(true).append(true).open(&log_path)?;
            let log_err = log.try_clone()?;

            let child = Command::new(runtime.join("node"))
                .arg("server.js")
                .current_dir(&runtime)
                .env("PORT", PORT.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("NODE_ENV", "production")
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(log_err))
                .spawn()
                .map_err(|e| format!("failed to start runtime: {e}"))?;
            app.manage(Sidecar(Mutex::new(Some(child))));

            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(40) {
                if healthy(PORT) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(300));
            }
            if !healthy(PORT) {
                if let Some(state) = app.try_state::<Sidecar>() {
                    if let Some(mut c) = state.0.lock().unwrap().take() {
                        let _ = c.kill();
                    }
                }
                return Err(format!("local server did not become healthy; see {}", log_path.display()).into());
            }

            let url: tauri::Url = format!("http://127.0.0.1:{PORT}/desktop").parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("元婴 Desktop")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1100.0, 700.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Yuanying desktop");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app.try_state::<Sidecar>() {
                if let Some(mut child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
