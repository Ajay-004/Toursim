const express = require('express');
const router = express.Router();

/**
 * @desc    Cleans AI responses by removing citation markers and extra text.
 */
const cleanAIResponse = (text) => {
    // Removes citation markers like [1], [2], etc. and trims whitespace.
    return text.replace(/\[\d+\]/g, '').trim();
};

/**
 * @desc    Cleans and parses a JSON response from the AI.
 */
const cleanAndParseJSON = (text) => {
    const cleanedText = cleanAIResponse(text);
    // Use a regular expression to find a JSON object within the string
    const jsonMatch = cleanedText.match(/\{.*\}/s);
    if (!jsonMatch) {
        throw new Error("No JSON object found in AI response.");
    }
    return JSON.parse(jsonMatch[0]);
};


// --- Helper function to call the Gemini API ---
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
    const modelName = "gemini-2.5-flash";
    
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    
    // Safety check for candidates
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("AI returned no candidates.");
    }

    return data.candidates[0].content.parts[0].text;
};


/**
 * @route   POST /api/map/search
 */
router.post('/search', async (req, res) => {
    const { query } = req.body;
    try {
        const prompt = `
            You are a geocoding assistant. A user is searching for a location in India: "${query}".
            Find the geographic coordinates.
            Your entire response MUST be a single JSON object. Do not add extra text or markdown.
            If found: { "name": "...", "lat": ..., "lon": ... }
            If not found: { "error": "Location not found" }
        `;
        const aiResponse = await callGeminiAPI(prompt, true);
        const locationData = cleanAndParseJSON(aiResponse);

        if (locationData.error) { return res.json([]); }
        
        const result = {
            name: locationData.name,
            lat: locationData.lat,
            lon: locationData.lon,
            imageUrl: `https://placehold.co/600x400/cccccc/ffffff?text=${encodeURIComponent(locationData.name)}`
        };
        res.json([result]);
    } catch (err) {
        console.error("Error in AI map search:", err.message);
        res.status(500).json({ message: "Error processing your search." });
    }
});


/**
 * @route   POST /api/map/query
 */
router.post('/query', async (req, res) => {
    const { locationName, question, language } = req.body; 
    
    const prompt = `
        You are a tour guide. A user is looking at "${locationName}" and asks: "${question}"
        Provide a short, sweet, and easy-to-understand answer.
        IMPORTANT: The user's language is "${language}". Respond ENTIRELY in that language.
        Do not include citation markers like [1].
    `;
    try {
        const rawAnswer = await callGeminiAPI(prompt, true);
        const cleanedAnswer = cleanAIResponse(rawAnswer);
        res.json({ answer: cleanedAnswer });
    } catch (err) {
        res.status(500).json({ message: "Could not get an answer from the AI." });
    }
});


/**
 * @route   POST /api/map/history
 */
router.post('/history', async (req, res) => {
    const { locationName, language } = req.body; 
    
    const prompt = `
        You are a historian. Provide a brief, two-sentence summary of the history of ${locationName}.
        IMPORTANT: The user's language is "${language}". Respond ENTIRELY in that language.
        Do not include citation markers like [1].
    `;
    try {
        const rawHistory = await callGeminiAPI(prompt, true);
        const cleanedHistory = cleanAIResponse(rawHistory);
        res.json({ history: cleanedHistory });
    } catch (err) {
        res.status(500).json({ message: "Could not generate history." });
    }
});


/**
 * @route   POST /api/map/weather
 */
router.post('/weather', async (req, res) => {
    const { locationName, language } = req.body; 

    const prompt = `
        You are a weather service assistant. 
        Use your search tool to find the current, real-time weather for: "${locationName}".
        Your entire response MUST be a single JSON object. Do not add extra text or markdown.
        The JSON object should contain: "temp" (number), "description" (string), "icon" (string), and "tips" (array of 3 short strings).
        IMPORTANT: The user's language is "${language}". The "description" and "tips" array MUST be in that language.
        If you cannot find the weather, respond with: { "error": "Weather data not available" }
    `;
    try {
        const aiResponse = await callGeminiAPI(prompt, true);
        const weatherData = cleanAndParseJSON(aiResponse);
        if (weatherData.error) {
            return res.status(404).json({ message: weatherData.error });
        }
        res.json(weatherData);
    } catch (err) {
        res.status(500).json({ message: "Error processing weather request." });
    }
});

module.exports = router;
