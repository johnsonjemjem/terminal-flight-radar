# 🚀 The Ultimate iTerm2 Cheat Sheet & Power-User Guide

iTerm2 is an incredibly powerful terminal emulator for macOS. This cheat sheet compiles essential keyboard shortcuts, configuration guides, and advanced features to supercharge your terminal workflow.

---

## 📂 1. Window, Tab, & Pane Management

Panes (splits) and tabs allow you to organize multiple sessions without cluttering your screen.

### ✂️ Split Panes (Dividing a Tab)

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **Split Vertically** | `Cmd + D` | Splits the current pane vertically into two columns |
| **Split Horizontally** | `Cmd + Shift + D` | Splits the current pane horizontally into two rows |
| **Navigate Panes** | `Cmd + Opt + ↑/↓/←/→` | Moves focus between split panes |
| **Next / Prev Pane** | `Cmd + [` and `Cmd + ]` | Cycle focus through panes in order of creation |
| **Maximize Pane** | `Cmd + Shift + Enter` | Toggles the active pane to fullscreen and back (Zoom) |
| **Resize Pane** | `Cmd + Ctrl + ↑/↓/←/→` | Expands or shrinks the active pane boundaries |
| **Equalize Panes** | `Cmd + Shift + E` | Resizes all splits in the current tab to equal widths/heights |
| **Close Pane** | `Cmd + W` | Closes the active pane (terminating its shell session) |

### 📑 Tab Management

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **New Tab** | `Cmd + T` | Opens a new tab in the current window |
| **Close Tab** | `Cmd + W` | Closes the active tab (or active pane if split) |
| **Next Tab** | `Ctrl + Tab` or `Cmd + Shift + ]` | Focuses the next tab to the right |
| **Previous Tab** | `Ctrl + Shift + Tab` or `Cmd + Shift + [` | Focuses the previous tab to the left |
| **Go to Specific Tab** | `Cmd + [1-9]` | Direct jump to tabs 1 through 9 |
| **Exposé All Tabs** | `Cmd + Opt + E` | Displays a visual grid preview of all open tabs and panes |
| **Move Tab Left/Right** | `Cmd + Shift + Opt + ←/→` | Reorders the active tab's position in the tab bar |

### 🪟 Window Control

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **New Window** | `Cmd + N` | Opens a fresh, separate terminal window |
| **Toggle Fullscreen** | `Cmd + Enter` | Toggles macOS native fullscreen mode |
| **Close Window** | `Cmd + Shift + W` | Closes the entire window and all its tabs |
| **Hotkey Window** | *User Defined* | Toggle a drop-down visor terminal (Configure in Preferences) |

---

## ✍️ 2. Text Navigation, Selection & Editing

Speed up your CLI editing with keyboard-driven cursor navigation and manipulation.

| Action | Shortcut | Description / Setup |
| :--- | :--- | :--- |
| **Copy Selected Text** | *(Automatic)* | Just highlight text with your mouse; iTerm2 copies it instantly |
| **Paste** | `Cmd + V` | Paste copied clipboard contents |
| **Paste History** | `Cmd + Shift + H` | Opens a popup window showing your clipboard history to select and paste |
| **Move Cursor Word Left** | `Opt + ←` | Jump cursor one word to the left *(See Setup below)* |
| **Move Cursor Word Right** | `Opt + →` | Jump cursor one word to the right *(See Setup below)* |
| **Jump to Start of Line** | `Cmd + ←` or `Ctrl + A` | Move cursor to the beginning of the command |
| **Jump to End of Line** | `Cmd + →` or `Ctrl + E` | Move cursor to the end of the command |
| **Delete Word Backward** | `Opt + Backspace` | Deletes the word behind the cursor |
| **Delete Line Backward** | `Cmd + Backspace` | Deletes everything from the cursor to the start of the line |
| **Select Rectangular Block** | `Cmd + Opt + Drag` | Allows selecting a column block instead of continuous wrapped text |
| **Autocomplete Command** | `Cmd + ;` | iTerm2's built-in suggestion menu based on history |

---

## 🔍 3. Search & Command History

Never scroll through thousands of lines of logs manually again.

| Action | Shortcut | Description |
| :--- | :--- | :--- |
| **Find Text** | `Cmd + F` | Opens the search bar. Supports regex and case-sensitive queries |
| **Find Next Match** | `Cmd + G` | Moves to the next search match going down |
| **Find Previous Match** | `Cmd + Shift + G` | Moves to the previous search match going up |
| **Clear Buffer** | `Cmd + K` | Clears all scrollback history (great for starting fresh) |
| **Clear Current View** | `Ctrl + L` | Standard shell shortcut to clear visible screen, keeping scrollback |

---

## 🛠️ 4. Pro-Tips & Advanced Configurations

iTerm2 contains hidden gems that standard terminal emulators do not possess. 

### ⏱️ Pro-Tip A: Enable Word Navigation (`Option + Arrow Keys`)
By default, macOS terminals do not configure `Option + Left` and `Option + Right` to move word-by-word in shells like `bash` or `zsh`. To configure this:

1. Open **Preferences** (`Cmd + ,`).
2. Go to **Profiles** ➔ **Keys** ➔ **Key Mappings**.
3. Look at the bottom preset dropdown: click **Presets...** and select **Natural Text Editing**.
4. *Alternatively, you can manually map them:*
   * Click **`+`** to add a new shortcut.
   * **Keyboard Shortcut**: `Opt + ←` | **Action**: `Send Escape Sequence` | **Esc+**: `b`
   * Click **`+`** again.
   * **Keyboard Shortcut**: `Opt + →` | **Action**: `Send Escape Sequence` | **Esc+**: `f`
   * **Keyboard Shortcut**: `Cmd + Backspace` | **Action**: `Send Hex Code` | **Hex**: `0x15` (Deletes line)

---

### 🕒 Pro-Tip B: Instant Replay (`Cmd + Option + B`)
Did a build error flash on your screen and disappear, or did you run a command that outputs stdout fast?
* Press `Cmd + Opt + B` to trigger **Instant Replay**.
* Use the slider at the bottom of the screen or your arrow keys (`←` and `→`) to step back and forward in time.
* Press `Esc` to exit replay mode.

---

### 🎙️ Pro-Tip C: The Composer (`Cmd + Shift + .`)
If you are writing a massive, multi-line command, script, or JSON payload:
* Press `Cmd + Shift + .` (or `Cmd + Shift + C`) to open the **Composer**.
* This opens a syntax-highlighted, multi-line text editor dialog.
* Edit your command comfortably, press `Cmd + Enter` to send it to the terminal, or `Esc` to cancel.

---

### 🔔 Pro-Tip D: Alert on Command Completion (`Cmd + Option + A`)
If you are running a long migration, install, or build script:
* Press `Cmd + Opt + A` while the command is running.
* You will see a small eye icon appear in the corner of your pane.
* You can safely switch to another window. iTerm2 will trigger a macOS system notification the moment the terminal becomes silent (meaning your command finished).

---

### 🐚 Pro-Tip E: Install Shell Integration
Installing shell integration allows iTerm2 to understand your prompt, commands, and folders natively. It adds:
* Clickable files and locations.
* Jump markers (use `Cmd + Shift + ↑/↓` to jump directly to your previous command prompt inputs).
* Status bar components for Git branch, directory, etc.

To install, execute this command in your terminal:
```bash
curl -L https://iterm2.com/shell_integration/install_shell_integration_and_utilities.sh | bash
```

---

## 🎨 5. Customizing iTerm2 UI & Aesthetics

To make your terminal feel modern, premium, and beautiful:

1. **Enable the Status Bar**:
   * Go to **Preferences** ➔ **Profiles** ➔ **Session**.
   * Check **Status bar enabled**.
   * Click **Configure Status Bar** and drag items (CPU, Memory, Network, Git Branch, Clock) into your layout.
2. **Glassmorphism Transparency**:
   * Go to **Preferences** ➔ **Profiles** ➔ **Window**.
   * Adjust **Transparency** to `10–20%` and turn up **Blur** to `15–30` to get a beautiful Frosted Glass effect.
3. **Use a Sleek Color Scheme**:
   * Go to **Preferences** ➔ **Profiles** ➔ **Colors**.
   * Choose from the **Color Presets...** dropdown in the bottom right corner (e.g., *Pastel*, *Tango Dark*, or download themes like *Snazzy* or *Dracula* and import them).
