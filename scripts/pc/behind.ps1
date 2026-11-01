# Puts the Chrome window a PC run opens (chrome.mjs open()) behind every other
# window and gives the foreground back to the window that had it, so a run
# doesn't take the screen or the keyboard from whoever is working at this PC.
# Chrome draws every frame all the same behind them (Playwright starts it with
# --disable-backgrounding-occluded-windows): 240 frames a second at 4.2 ms
# either way, the page "visible", when this was tried on 1 November 2026.
#
# Prints "ready" once it knows the window in front; Chrome is started after
# that. Then waits up to 60 s for a visible Chrome window whose process started
# after "ready", puts it behind, and for 5 s more puts it back behind whenever
# it comes to the front again (as a page is made or loaded).

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Behind {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool on);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  // The visible top-level windows of Chrome's class (Electron apps share it: the caller checks the process).
  public static List<IntPtr> Windows() {
    var all = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(64);
      GetClassName(h, s, 64);
      if (s.ToString() == "Chrome_WidgetWin_1") all.Add(h);
      return true;
    }, IntPtr.Zero);
    return all;
  }

  // Behind every other window (HWND_BOTTOM; SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE), and the
  // foreground back to `prev`: joined to the foreground's input for the moment, which Windows asks.
  public static void Back(IntPtr h, IntPtr prev) {
    SetWindowPos(h, (IntPtr)1, 0, 0, 0, 0, 0x13);
    if (prev == IntPtr.Zero || !IsWindow(prev)) return;
    uint ignored;
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fg, true);
    SetForegroundWindow(prev);
    AttachThreadInput(me, fg, false);
  }
}
"@

$prev = [Behind]::GetForegroundWindow()
$since = Get-Date
"ready"

function Ours {
  foreach ($h in [Behind]::Windows()) {
    $procId = 0
    [void][Behind]::GetWindowThreadProcessId($h, [ref]$procId)
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'chrome' -and $p.StartTime -ge $since) { return $h }
  }
  return [IntPtr]::Zero
}

$deadline = $since.AddSeconds(60)
$win = [IntPtr]::Zero
while ($win -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
  $win = Ours
  if ($win -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 20 }
}
if ($win -eq [IntPtr]::Zero) { "no window found"; exit }
[Behind]::Back($win, $prev)
$until = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $until) {
  if ([Behind]::GetForegroundWindow() -eq $win) { [Behind]::Back($win, $prev) }
  Start-Sleep -Milliseconds 20
}
"behind"
