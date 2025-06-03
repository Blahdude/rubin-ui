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
        // MODIFIED: Increase max width percentage
        const maxAllowedWidth = Math.floor(workArea.width * (this.appState.getHasDebugged() ? 0.9 : 0.85) // Increased to 85% / 90%
        );
        // MODIFIED: Adjust vertical margin for positioning
        const verticalMargin = 20; // Further down from the top (reduced from 30)
        const horizontalMargin = 5; // Closer to the right edge (remains same)
        // Calculate new X position
        const newX = workArea.width - maxAllowedWidth - horizontalMargin;
        // Use current Y or new verticalMargin if window was moved manually
        // For now, let's always try to position it based on the margin from top
        const newY = verticalMargin;
        // Calculate new height, capped by screen height
        const maxAllowedHeight = workArea.height - verticalMargin - 10; // 10px for bottom clearance
        const finalHeight = Math.min(Math.ceil(height), maxAllowedHeight);
        // Update window bounds
        // MODIFIED: Use maxAllowedWidth directly for window width
        this.mainWindow.setBounds({
            x: newX,
            y: newY,
            width: maxAllowedWidth,
            height: finalHeight
        });
        // Update internal state
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
        // MODIFIED: Increase initial window size to a percentage of screen
        const initialWidth = Math.floor(workArea.width * 0.60); // Start at 60% width
        const initialHeight = Math.floor(workArea.height * 0.70); // Start at 70% height
        // Consistent with setWindowDimensions for top-right positioning
        const horizontalMargin = 5;
        const verticalMargin = 20; // MODIFIED: Reduced from 30 to match setWindowDimensions change
        this.currentX = this.screenWidth - initialWidth - horizontalMargin; // Position X
        this.currentY = verticalMargin; // Position Y
        const windowSettings = {
            height: initialHeight,
            width: initialWidth,
            minWidth: undefined,
            maxWidth: undefined,
            x: this.currentX,
            y: this.currentY, // Use centered Y
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js")
            },
            show: true,
            alwaysOnTop: true,
            frame: false,
            transparent: true,
            fullscreenable: false,
            hasShadow: false,
            backgroundColor: "#00000000",
            focusable: true
        };
        this.mainWindow = new electron_1.BrowserWindow(windowSettings);
        // this.mainWindow.webContents.openDevTools()
        this.mainWindow.setContentProtection(true);
        if (process.platform === "darwin") {
            this.mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            });
            this.mainWindow.setHiddenInMissionControl(true);
            this.mainWindow.setAlwaysOnTop(true, "floating");
        }
        if (process.platform === "linux") {
            // Linux-specific optimizations for stealth overlays
            if (this.mainWindow.setHasShadow) {
                this.mainWindow.setHasShadow(false);
            }
            this.mainWindow.setFocusable(false);
        }
        this.mainWindow.setSkipTaskbar(true);
        this.mainWindow.setAlwaysOnTop(true);
        this.mainWindow.loadURL(startUrl).catch((err) => {
            console.error("Failed to load URL:", err);
        });
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
        this.currentX = Math.min(this.screenWidth - halfWidth, this.currentX + this.step);
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
        this.currentX = Math.max(-halfWidth, this.currentX - this.step);
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