// ===================================================================================
// --- GUAMAHAMMER PERSISTENT SERVER (server.js) ---
// --- Handles file I/O for Admin Editor and serves static content ---
// ===================================================================================
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

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
app.post('/api/save-army', async (req, res) => {
    try {
        const data = req.body;
        const factionId = data.FACTION_ID; //

        if (!factionId) {
            return res.status(400).json({ message: 'Faction ID is missing from data.' }); //
        }
        
        // Format the content back into an ES module export structure.
        const finalFileContent = `export default ${JSON.stringify(data, null, 4)};`;
        
        // Determine the correct file path. 'comun' is a special case.
        let filePath;
        if (factionId === 'comun') {
            filePath = path.join(__dirname, 'comun.js'); 
        } else {
            filePath = path.join(__dirname, 'armies', `${factionId}.js`); //
        }

        await fs.writeFile(filePath, finalFileContent); // Write the data back to the file.

        return res.status(200).json({ message: `${factionId} saved successfully.` }); //
    } catch (error) {
        console.error("Error saving file:", error);
        return res.status(500).json({ message: `Error saving file: ${error.message}` }); //
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
        return res.status(400).json({ message: 'Faction ID is required.' }); //
    }

    // Create a path for a temporary ES module (.mjs is often used for dynamic import)
    const tempFilePath = path.join(os.tmpdir(), `${factionId}-${Date.now()}.mjs`); //

    try {
        let originalFilePath;
        if (factionId === 'comun') {
            originalFilePath = path.join(__dirname, 'comun.js'); //
        } else {
            originalFilePath = path.join(__dirname, 'armies', `${factionId}.js`); //
        }

        let fileContent = await fs.readFile(originalFilePath, 'utf8'); // Read the content of the .js file.

        // Remove the import line for 'comun.js' (critical step for dynamic import on server)
        fileContent = fileContent.replace(/^import.*comun\.js.*?;/gm, ''); //

        // Write content to a temp file to safely use the native `import()` function.
        await fs.writeFile(tempFilePath, fileContent); //

        // Dynamically import the temp file.
        const armyModule = await import(tempFilePath + '?' + Date.now()); //
        const dataObject = armyModule.default;

        return res.status(200).json(dataObject); // Return the parsed JSON object.

    } catch (error) {
        console.error(`Error processing file for faction: ${factionId}`, error);
        return res.status(500).json({ message: 'Server error while processing file.' }); //
    } finally {
        try {
            // Clean up the temporary file
            await fs.unlink(tempFilePath); //
        } catch (cleanupError) {
            console.error('Failed to clean up temp file:', cleanupError);
        }
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});