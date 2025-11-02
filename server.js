// ===================================================================================
// --- GUAMAHAMMER PERSISTENT SERVER (server.js) ---
// --- Handles file I/O for Admin Editor and serves static content ---
// ===================================================================================
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 8080; // Use environment port for deployment

// --- Middleware ---
// Allows Express to read JSON data from POST requests.
app.use(express.json()); 
// Serves all your static files (index.html, main.js, /armies folder, etc.) from the root directory.
app.use(express.static(path.join(__dirname))); 

// --- API Routes ---

/**
 * [POST] /api/save-army
 * Handles saving the entire army data object back to its respective .js file.
 * This enables the Admin Editor's functionality.
 */
// server.js

// REPLACE the entire app.post('/api/save-army', ...) route
app.post('/api/save-army', async (req, res) => {
    try {
        // The client now sends the factionId and the pre-formatted content
        const { factionId, fileContent } = req.body;

        if (!factionId || !fileContent) {
            return res.status(400).json({ message: 'Faction ID or file content is missing.' });
        }
        
        // --- THIS IS A CRITICAL FIX FOR SAVING comun.js ---
        // Determine the correct file path. 'comun' is a special case.
        let filePath;
        if (factionId === 'comun') {
            // It saves to the root directory
            filePath = path.join(__dirname, 'comun.js'); 
        } else {
            // All other armies save to the /armies/ directory
            filePath = path.join(__dirname, 'armies', `${factionId}.js`);
        }

        // The fileContent is already perfectly formatted by the client,
        // so we just write it directly.
        await fs.writeFile(filePath, fileContent);

        console.log(`Successfully saved ${factionId}.js to ephemeral storage.`);
        return res.status(200).json({ message: `${factionId} saved successfully.` });

    } catch (error) {
        console.error("Error saving file:", error);
        return res.status(500).json({ message: `Error saving file: ${error.message}` });
    }
});

/**
 * [GET] /api/get-army
 * Handles loading army data by reading the .js file and parsing it into a JSON object.
 * This powers the Army Builder's (main.js) data loading.
 */
app.get('/api/get-army', async (req, res) => {
    const factionId = req.query.faction;
    if (!factionId) {
        return res.status(400).json({ message: 'Faction ID is required.' });
    }

    const tempFilePath = path.join(os.tmpdir(), `${factionId}-${Date.now()}.mjs`);
    const comunFilePath = path.join(__dirname, 'comun.js');

    try {
        let originalFilePath;
        if (factionId === 'comun') {
            originalFilePath = comunFilePath;
        } else {
            originalFilePath = path.join(__dirname, 'armies', `${factionId}.js`);
        }

        let fileContent = await fs.readFile(originalFilePath, 'utf8');

        // --- STEP 1: Remove the client-side import statement ---
        fileContent = fileContent.replace(/^import.*comun\.js.*?;/gm, '');

        // --- STEP 2: Handle the structural dependency issue (The final fix) ---
        // This targets files (like cvstr.js) that attempt to use commonMagicItemsDB in their local scope.
        // It replaces the usage with an empty object literal '{}', allowing Node to parse the file.
        const structuralFixRegex = /commonMagicItemsDB/g;
        if (originalFilePath.includes('cvstr.js') || originalFilePath.includes('cvnec.js')) {
            fileContent = fileContent.replace(structuralFixRegex, '{}');
        }

        // --- FINAL STEP: Dynamic Import ---
        const moduleUrl = url.pathToFileURL(tempFilePath).href;
        await fs.writeFile(tempFilePath, fileContent);

        const armyModule = await import(moduleUrl + '?' + Date.now());
        let dataObject = armyModule.default;

        // Read comun.js data and attach it (for ejercitos.js to merge later).
        const comunContent = await fs.readFile(comunFilePath, 'utf8');
        const comunTempPath = path.join(os.tmpdir(), `comun-${Date.now()}.mjs`);
        await fs.writeFile(comunTempPath, comunContent);
        const comunModule = await import(url.pathToFileURL(comunTempPath).href + '?' + Date.now());
        dataObject.COMMON_MAGIC_ITEMS = comunModule.commonMagicItemsDB;

        // Clean up the temporary comun file
        await fs.unlink(comunTempPath);

        return res.status(200).json(dataObject);

    } catch (error) {
        console.error(`Error processing file for faction: ${factionId}`, error);
        return res.status(500).json({ message: `Server error while processing file for ${factionId}. Check function logs.` });
    } finally {
        try {
            await fs.unlink(tempFilePath);
        } catch (cleanupError) {
            console.error('Failed to clean up temp file:', cleanupError);
        }
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});