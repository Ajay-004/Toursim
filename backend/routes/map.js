const express = require('express');
const router = express.Router();

/**
 * @desc    Cleans AI responses by removing citation markers and markdown code blocks.
 */
const cleanAIResponse = (text) => {
    // Removes markdown backticks (```json ... ```) and citation markers [1]
    return text.replace(/```json|```/g, '').replace(/\[\d+\]/g, '').trim();
};

const cleanAndParseJSON = (text) => {
    const cleanedText = cleanAIResponse(text);
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/); // Improved regex for multi-line JSON
    if (!jsonMatch) {
        throw new Error("No JSON object found in AI response.");
    }
    return JSON.parse(jsonMatch[0]);
};

// --- Helper function for Gemini 2.0 Flash Lite ---
const callGeminiAPI = async (prompt, enableSearch = false) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured.');
    }

    const payload = { 
        contents: [{ parts: [{ text: prompt }] }] 
    };

    // Use Google Search grounding if requested
    if (enableSearch) {
        payload.tools = [{ "google_search": {} }];
    }

    // TARGET MODEL: gemini-2.0-flash-lite
    const MODEL_ID = "gemini-2.0-flash-lite";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Gemini API Error:", errorBody);
        throw new Error('Failed to get a response from the AI service.');
    }

    const data = await response.json();
    
    // Check if the model used a tool (like search) or returned direct text
    return data.candidates[0].content.parts[0].text;
};

// --- Routes remain the same logic, but now benefit from 2.0 Flash Lite's speed ---

router.post('/search', async (req, res) => {
    const { query } = req.body;
    try {
        const prompt = `
            You are a geocoding assistant. Find coordinates for: "${query}" in India.
            Response MUST be a single JSON object:
            { "name": "...", "lat": ..., "lon": ... }
            If not found: { "error": "Location not found" }
        `;
        const aiResponse = await callGeminiAPI(prompt, true);
        const locationData = cleanAndParseJSON(aiResponse);

        if (locationData.error) return res.json([]);
        
        res.json([{
            ...locationData,
            imageUrl: `https://placehold.co/600x400/cccccc/ffffff?text=${encodeURIComponent(locationData.name)}`
        }]);
    } catch (err) {
        res.status(500).json({ message: "Error processing search." });
    }
});

// ... (Other routes: /query, /history, /weather follow the same pattern)

module.exports = router;
