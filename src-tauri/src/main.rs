// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "macos")]
    {
        // Disable macOS press-and-hold character popup, so key repeat works in terminal.
        use objc2::msg_send;
        use objc2_foundation::{ns_string, NSUserDefaults};
        unsafe {
            let defaults = NSUserDefaults::standardUserDefaults();
            let key = ns_string!("ApplePressAndHoldEnabled");
            let _: () = msg_send![&defaults, setBool: false, forKey: key];
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Enable hardware acceleration, smooth scrolling, and GPU rasterization for WebView2
        // to ensure silky-smooth 60/120fps scrolling.
        // Cap disk/media cache sizes and disable unnecessary background browser features to optimize RAM.
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-gpu-rasterization --enable-smooth-scrolling --disk-cache-size=33554432 --media-cache-size=16777216 --disable-features=Translate,InterestFeedContentSuggestions,MediaRouter --enable-features=ResourceScheduler",
        );
    }

    taucode_lib::run()
}
