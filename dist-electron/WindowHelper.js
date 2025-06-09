"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const startUrl = isDev
    ? "http://localhost:5180"
    : `file://${node_path_1.default.join(__dirname, "../dist/index.html")}`;
class WindowHelper {
    mainWindow = null;
    isWindowVisible = false;
    windowPosition = null;
    windowSize = null;
    appState;
    // Initialize with explicit number type and 0 value
    screenWidth = 0;
    screenHeight = 0;
    step = 0;
    currentX = 0;
    currentY = 0;
    constructor(appState) {
        this.appState = appState;
    }
    setWindowDimensions(width, height) {
        if (!this.mainWindow || this.mainWindow.isDestroyed())
            return;
        // Get current window position
        const [currentXPos, currentYPos] = this.mainWindow.getPosition(); // Renamed to avoid conflict
        // Get screen dimensions
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        // MODIFIED: Decrease max width percentage for a narrower window
        const maxAllowedWidth = Math.floor(workArea.width * (this.appState.getHasDebugged() ? 0.30 : 0.25) // Narrower: 25% normal, 30% debug
        );
        const verticalMargin = 20; // Keep some margin from the top
        const horizontalMargin = 5; // Keep some margin from the right edge
        const newX = workArea.width - maxAllowedWidth - horizontalMargin;
        const newY = verticalMargin; // Position near the top
        // Calculate new height, capped by screen height, allowing it to be tall
        const maxAllowedHeight = workArea.height - verticalMargin - 10; // 10px for bottom clearance
        const finalHeight = Math.min(Math.ceil(height), maxAllowedHeight);
        this.mainWindow.setBounds({
            x: newX,
            y: newY,
            width: maxAllowedWidth,
            height: finalHeight
        });
        this.windowPosition = { x: newX, y: newY };
        this.windowSize = { width: maxAllowedWidth, height: finalHeight };
        this.currentX = newX;
        this.currentY = newY;
    }
    createWindow() {
        if (this.mainWindow !== null)
            return;
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        this.screenWidth = workArea.width;
        this.screenHeight = workArea.height;
        this.step = Math.floor(this.screenWidth / 10); // 10 steps
        // Adjust initial window size for narrower width and taller height
        const initialWidth = Math.floor(workArea.width * 0.25); // Narrower: 25% width
        const initialHeight = Math.floor(workArea.height * 0.90); // Taller: 90% height
        const horizontalMargin = 5;
        const verticalMargin = 20;
        this.currentX = this.screenWidth - initialWidth - horizontalMargin; // Position X (right aligned)
        this.currentY = verticalMargin; // Position Y (near top)
        const windowSettings = {
            height: initialHeight,
            width: initialWidth,
            x: this.currentX,
            y: this.currentY,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js")
            },
            alwaysOnTop: false, // Normal window behavior
            frame: false, // Frameless for overlay style
            transparent: true, // TEMP: Make opaque to see content
            fullscreenable: true,
            hasShadow: true,
            focusable: true
        };
        this.mainWindow = new electron_1.BrowserWindow(windowSettings);
        // TEMP: Direct show since we're debugging content loading
        // Remove the ready-to-show handler for now
        if (process.platform === "darwin") {
            this.mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            });
            this.mainWindow.setHiddenInMissionControl(true);
            this.mainWindow.setAlwaysOnTop(false);
        }
        if (process.platform === "linux") {
            // Linux-specific window settings if needed
        }
        this.mainWindow.setSkipTaskbar(true); // Keep it as overlay app
        console.log("Loading URL:", startUrl);
        this.mainWindow.loadURL(startUrl).then(() => {
            console.log("✅ URL loaded successfully");
        }).catch((err) => {
            console.error("❌ Failed to load URL:", err);
        });
        // Add debugging for content loading
        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log("✅ Content finished loading");
        });
        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error("❌ Content failed to load:", errorCode, errorDescription);
        });
        // Dev tools disabled - uncomment to debug if needed
        // this.mainWindow.webContents.openDevTools()
        const bounds = this.mainWindow.getBounds();
        this.windowPosition = { x: bounds.x, y: bounds.y };
        this.windowSize = { width: bounds.width, height: bounds.height };
        this.currentX = bounds.x;
        this.currentY = bounds.y;
        this.setupWindowListeners();
        this.isWindowVisible = true;
    }
    setupWindowListeners() {
        if (!this.mainWindow)
            return;
        this.mainWindow.on("move", () => {
            if (this.mainWindow) {
                const bounds = this.mainWindow.getBounds();
                this.windowPosition = { x: bounds.x, y: bounds.y };
                this.currentX = bounds.x;
                this.currentY = bounds.y;
            }
        });
        this.mainWindow.on("resize", () => {
            if (this.mainWindow) {
                const bounds = this.mainWindow.getBounds();
                this.windowSize = { width: bounds.width, height: bounds.height };
            }
        });
        this.mainWindow.on("closed", () => {
            this.mainWindow = null;
            this.isWindowVisible = false;
            this.windowPosition = null;
            this.windowSize = null;
        });
    }
    getMainWindow() {
        return this.mainWindow;
    }
    isVisible() {
        return this.isWindowVisible;
    }
    hideMainWindow() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn("Main window does not exist or is destroyed.");
            return;
        }
        const bounds = this.mainWindow.getBounds();
        this.windowPosition = { x: bounds.x, y: bounds.y };
        this.windowSize = { width: bounds.width, height: bounds.height };
        this.mainWindow.hide();
        this.isWindowVisible = false;
    }
    showMainWindow() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn("Main window does not exist or is destroyed.");
            return;
        }
        if (this.windowPosition && this.windowSize) {
            this.mainWindow.setBounds({
                x: this.windowPosition.x,
                y: this.windowPosition.y,
                width: this.windowSize.width,
                height: this.windowSize.height
            });
        }
        this.mainWindow.showInactive();
        this.isWindowVisible = true;
    }
    toggleMainWindow() {
        if (this.isWindowVisible) {
            this.hideMainWindow();
        }
        else {
            this.showMainWindow();
        }
    }
    // New methods for window movement
    moveWindowRight() {
        if (!this.mainWindow)
            return;
        const windowWidth = this.windowSize?.width || 0;
        const halfWidth = windowWidth / 2;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        this.currentX = Math.min(this.screenWidth - windowWidth, this.currentX + this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowLeft() {
        if (!this.mainWindow)
            return;
        const windowWidth = this.windowSize?.width || 0;
        const halfWidth = windowWidth / 2;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        this.currentX = Math.max(0, this.currentX - this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowDown() {
        if (!this.mainWindow)
            return;
        const windowHeight = this.windowSize?.height || 0;
        const halfHeight = windowHeight / 2;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        this.currentY = Math.min(this.screenHeight - halfHeight, this.currentY + this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowUp() {
        if (!this.mainWindow)
            return;
        const windowHeight = this.windowSize?.height || 0;
        const halfHeight = windowHeight / 2;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        this.currentY = Math.max(-halfHeight, this.currentY - this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
}
exports.WindowHelper = WindowHelper;
//# sourceMappingURL=WindowHelper.js.map