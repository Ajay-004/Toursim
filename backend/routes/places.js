const express = require('express');
const router = express.Router();

/**
 * @desc    Helper function to call the Gemini API.
 */
const callGeminiAPI = async (prompt, enableSearch = false) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured.');
    }

    const payload = { 
        contents: [{ parts: [{ text: prompt }] }] 
    };

    if (enableSearch) {
        payload.tools = [{ "google_search": {} }];
    }

    // UPDATED: Using the Gemini 2.5 Flash model
    const modelId = "gemini-2.5-flash";
    
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }
    );

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Gemini API Error:", errorBody);
        throw new Error('Failed to get a response from the AI service.');
    }

    const data = await response.json();

    // Check if the response was blocked or is empty
    if (!data.candidates?.length || !data.candidates[0].content?.parts?.length) {
        if (data.promptFeedback?.blockReason) {
             console.warn(`Gemini response blocked: ${data.promptFeedback.blockReason}`);
             return "";
         }
        return "";
    }

    return data.candidates[0].content.parts[0].text;
};

/**
 * @desc    Cleans the raw HTML output from the Gemini API.
 */
const cleanHtmlResponse = (text) => {
    let cleanedText = text.replace(/^```(html)?\s*/i, '').replace(/\s*```$/, '');
    cleanedText = cleanedText.replace(/\[[\d,\s]+\]/g, ''); // Remove citation markers
    return cleanedText.trim();
};

/**
 * @desc    Cleans and parses a JSON response from the AI.
 */
const cleanAndParseJSON = (text) => {
    if (!text) return null;
    const cleanedText = text.replace(/\[[\d,\s]+\]/g, '').trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) return null;

    try {
        let potentialJson = jsonMatch[0];
        potentialJson = potentialJson.replace(/,\s*([\]}])/g, '$1'); // Fix trailing commas
        return JSON.parse(potentialJson);
    } catch (e) {
        console.error("JSON Parse Error:", e.message);
        return null;
    }
};

/**
 * @route   POST /api/find-places
 */
router.post('/', async (req, res) => {
    const { state, district, startLocation, language } = req.body;

    if (!state || !district || !language) {
        return res.status(400).json({ message: 'Please provide state, district, and language.' });
    }

    let startCoords = null;

    try {
        // --- Step 1: Get Start Location Coordinates ---
        if (startLocation && startLocation.trim() !== '') {
            const startCoordPrompt = `
                Find the latitude and longitude for: "${startLocation}".
                Response MUST be ONLY: {"lat": 12.34, "lon": 78.90}.
            `;
            const coordResponse = await callGeminiAPI(startCoordPrompt, true);
            const parsedCoords = cleanAndParseJSON(coordResponse);

            if (parsedCoords && typeof parsedCoords.lat === 'number') {
                startCoords = parsedCoords;
            }
        }

        // --- Step 2: Get Tourist Places ---
        let placesPrompt = `
            You are an expert Indian travel guide. Find up to 15 tourist spots in **${district}, ${state}, India**.
            Format: HTML. 
            Use <div class="place-card" data-lat="..." data-lon="...">
            Include <h4> for name and <p> for description.
            Language: ${language}.
        `;

        const rawPlacesHtml = await callGeminiAPI(placesPrompt, true);
        const cleanedPlacesHtml = cleanHtmlResponse(rawPlacesHtml);

        // --- Step 3: Send Response ---
        res.json({
            placesHtml: cleanedPlacesHtml,
            startLat: startCoords ? startCoords.lat : null,
            startLon: startCoords ? startCoords.lon : null
        });

    } catch (err) {
        console.error("Route Error:", err.message);
        res.status(500).json({ message: "Error finding tourist places." });
    }
});

module.exports = router;
