const express = require('express');
const router = express.Router();

// NOTE: The Location model is no longer required as we are using a static list.
// const Location = require('../models/Location');

/**
 * @route   POST /api/plan-trip
 * @desc    Generates a travel itinerary using the Gemini model.
 * @access  Public
 */
router.post('/', async (req, res) => {
    // 1. Destructure all fields, including 'language' and 'location'.
    // <-- NEW: Added 'language' here
    const { interests, days, budget, location, language } = req.body;

    // Basic validation
    // <-- NEW: Added check for language, although frontend should always send it
    if (!interests || !days || !budget || !language) {
        return res.status(400).json({ message: 'Please provide interests, days, budget, and language.' });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ message: 'AI service is currently unavailable. Administrator needs to configure the API key.' });
    }

    try {
        const availableLocations = getStaticLocations();
        const locationNames = availableLocations.map(loc => `${loc.name}, ${loc.state}`).join('; ');

        // 2. Construct the base prompt for the AI.
        let prompt = `
            You are an expert travel agent for India. Generate a personalized, day-by-day travel plan based on the user's preferences.

            **User Preferences:**
            - Interests: ${interests}
            - Duration: ${days} days
            - Budget: Approximately ₹${budget}
            - Language: ${language}  // <-- NEW: Inform AI about the language
        `;

        // 3. Dynamically modify the prompt based on whether a location was provided.
        if (location && location.trim() !== '') {
            prompt += `\n\n**IMPORTANT CONSTRAINT:** The user has specified a location. You MUST focus the entire itinerary exclusively on or around **${location}**. Do not suggest other locations outside of this area. All activities must be relevant to ${location}.`;
        } else {
            prompt += `\n\n**Available Locations to Choose From:** You can suggest an itinerary based on this list of famous places: ${locationNames}.`;
        }

        // Add formatting and language instructions to the end of the prompt.
        prompt += `
            \n**Instructions:**
            1.  Format the entire response strictly in HTML.
            2.  Start with an <h2> tag for the main title.
            3.  For each day, use an <h3> tag.
            4.  For each activity, use an <ul> with <li> tags. Be descriptive.
            5.  Do not include any markdown (like \`\`\`), just the raw HTML output.
            6.  **IMPORTANT:** Generate the entire HTML response (titles, activities, descriptions) **exclusively in the requested language: ${language}**.
        `; // <-- NEW: Explicit language instruction

        // 4. Make the API call to the Gemini model.
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error("Gemini API Error:", errorBody);
            throw new Error('Failed to get a response from the AI service.');
        }

        const geminiData = await geminiResponse.json();
        const generatedText = geminiData.candidates[0].content.parts[0].text;
        const cleanedHtml = cleanGeminiResponse(generatedText);

        res.json({ itinerary: cleanedHtml });

    } catch (err) {
        console.error("Error in AI planner route:", err.message);
        res.status(500).send({ message: 'An internal server error occurred while generating the plan.' });
    }
});

/**
 * @desc    Provides a static list of locations for the AI to use if no specific location is requested.
 * @returns {Array} An array of location objects.
 */
function getStaticLocations() {
    return [
        { state: "Uttar Pradesh", name: "Taj Mahal" },
        { state: "Rajasthan", name: "Hawa Mahal" },
        { state: "Tamil Nadu", name: "Meenakshi Temple" },
        { state: "Maharashtra", name: "Gateway of India" },
        { state: "Kerala", name: "Alleppey Backwaters" },
        { state: "West Bengal", name: "Victoria Memorial" },
        { state: "Karnataka", name: "Hampi" }
    ];
}

/**
 * @desc    Cleans the raw output from the Gemini API, removing markdown code fences.
 * @param   {string} text - The raw text from the Gemini response.
 * @returns {string} The cleaned HTML string.
 */
function cleanGeminiResponse(text) {
    // Remove potential markdown fences and trim whitespace
    return text.replace(/^```(html)?\s*/i, '').replace(/\s*```$/, '').trim();
}


module.exports = router;