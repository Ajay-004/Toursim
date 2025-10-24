const express = require('express');
const router = express.Router();

// --- Assume callGeminiAPI, cleanHtmlResponse, and cleanAndParseJSON functions exist ---
// (Copy them from your previous backend code)

/**
 * @desc    Helper function to call the Gemini API.
 * @param   {string} prompt - The prompt text for the AI.
 * @param   {boolean} enableSearch - Whether to enable Google Search tool.
 * @returns {Promise<string>} The raw text response from the AI.
 */
const callGeminiAPI = async (prompt, enableSearch = false) => {
    // ... (Keep the existing callGeminiAPI function) ...
     if (!process.env.GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured.');
    }
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    if (enableSearch) {
        payload.tools = [{ "google_search": {} }];
    }
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    if (!data.candidates?.length || !data.candidates[0].content?.parts?.length || typeof data.candidates[0].content.parts[0].text !== 'string') {
        if (data.promptFeedback?.blockReason) {
             console.warn(`Gemini response blocked: ${data.promptFeedback.blockReason} for prompt: ${prompt.substring(0, 100)}...`);
             return "";
         }
        console.warn("Invalid response structure from AI service. Data:", JSON.stringify(data).substring(0, 200));
        return "";
    }
    return data.candidates[0].content.parts[0].text;
};

/**
 * @desc    Cleans the raw HTML output from the Gemini API.
 * @param   {string} text - The raw text from the Gemini response.
 * @returns {string} The cleaned HTML string.
 */
const cleanHtmlResponse = (text) => {
    // ... (Keep the existing cleanHtmlResponse function) ...
     let cleanedText = text.replace(/^```(html)?\s*/i, '').replace(/\s*```$/, '');
    cleanedText = cleanedText.replace(/\[[\d,\s]+\]/g, ''); // Remove citation markers
    return cleanedText.trim();
};

/**
 * @desc    Cleans and parses a JSON response from the AI. Logs detailed errors.
 * @param   {string} text - The raw text from the Gemini response.
 * @returns {object | null} The parsed JSON object or null if parsing fails.
 */
const cleanAndParseJSON = (text) => {
    // ... (Keep the existing cleanAndParseJSON function) ...
    if (!text) return null;
    const cleanedText = text.replace(/\[[\d,\s]+\]/g, '').trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
         console.warn("CleanAndParseJSON Error: No JSON object found in AI response text:", cleanedText.substring(0, 100));
        return null;
    }
    try {
        let potentialJson = jsonMatch[0];
        potentialJson = potentialJson.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(potentialJson);
    } catch (e) {
         console.error("CleanAndParseJSON Error: Failed to parse JSON:", e.message, "Attempted JSON string:", jsonMatch ? jsonMatch[0].substring(0, 200) : cleanedText.substring(0,200));
         return null;
    }
};
// --- End Helper Functions ---

/**
 * @route   POST /api/find-places
 * @desc    Uses AI to find tourist places including coordinates, and gets starting location coordinates.
 * @access  Public
 */
router.post('/', async (req, res) => {
    // <-- REMOVED: 'location' is no longer received
    const { state, district, startLocation, language } = req.body;

    if (!state || !district || !language) { // startLocation validation happens on frontend if needed
        return res.status(400).json({ message: 'Please provide state, district, and language.' });
    }

    let startCoords = null;

    try {
        // --- Step 1: Get Start Location Coordinates (if provided) ---
        if (startLocation && startLocation.trim() !== '') {
            try {
                const startCoordPrompt = `
                    You are a precise geocoding assistant. Find the latitude and longitude for the location: "${startLocation}".
                    Your entire response MUST be ONLY a single, valid JSON object like this: {"lat": 12.34, "lon": 78.90}.
                    Do NOT include any introduction, explanation, markdown, or other text.
                    If the location is ambiguous or cannot be found, respond ONLY with: {"error": "not found"}.
                `;
                const coordResponse = await callGeminiAPI(startCoordPrompt, true);
                const parsedCoords = cleanAndParseJSON(coordResponse);

                if (parsedCoords && typeof parsedCoords.lat === 'number' && typeof parsedCoords.lon === 'number' && !parsedCoords.error) {
                    startCoords = parsedCoords;
                    console.log(`Successfully found coordinates for "${startLocation}":`, startCoords);
                } else {
                    const reason = parsedCoords?.error ? 'AI reported not found' : 'Invalid/missing lat/lon or parse failure';
                    console.warn(`Could not get valid coordinates for start location "${startLocation}". Reason: ${reason}. AI Response: ${coordResponse.substring(0, 100)}`);
                    startCoords = null;
                }
            } catch (coordErr) {
                console.error(`Exception during coordinate fetching for "${startLocation}":`, coordErr.message);
                startCoords = null;
            }
        }

        // --- Step 2: Get Tourist Places ---
        // <-- UPDATED: Prompt no longer refers to the optional 'location' input
        let placesPrompt = `
            You are an expert Indian travel guide. A user wants to find tourist places.
            Your task is to identify and describe up to 15 interesting tourist spots within the **${district} district, ${state}, India**.

            For each place, provide a concise description highlighting what makes it interesting, and its approximate latitude and longitude.

            **Instructions:**
            1.  Format your entire response strictly in HTML.
            2.  For each place, create a container div with the class "place-card".
            3.  **Crucially:** Add 'data-lat' and 'data-lon' attributes to the "place-card" div containing the approximate latitude and longitude respectively. Example: <div class="place-card" data-lat="13.08" data-lon="80.27">
            4.  Inside the card, use an <h4> tag for the place name.
            5.  Use one or more <p> tags for the description.
            6.  If you cannot find specific tourist spots for the district, provide general info about the district/state, or return a single <p> tag with a friendly message explaining that specific information isn't available (do not include data-lat/lon in this case).
            7.  Do not include any markdown like \`\`\` or citation markers like [1] or [6, 17].
            8.  **IMPORTANT:** Generate the entire HTML response (place names, descriptions, attributes, and any messages) **exclusively in the requested language: ${language}**.
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
        console.error("Error in AI place finder route processing:", err.message);
        res.status(500).json({ message: "Error finding tourist places." });
    }
});

module.exports = router;