const express = require('express');
const router = express.Router();

/**
 * @route   POST /api/plan-trip
 * @desc    Generates a travel itinerary using Gemini 2.5 Flash.
 */
router.post('/', async (req, res) => {
    const { interests, days, budget, location, language } = req.body;

    // Basic validation
    if (!interests || !days || !budget || !language) {
        return res.status(400).json({ message: 'Please provide interests, days, budget, and language.' });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ message: 'AI service API key is not configured.' });
    }

    try {
        const availableLocations = getStaticLocations();
        const locationNames = availableLocations.map(loc => `${loc.name}, ${loc.state}`).join('; ');

        // 1. Construct the base prompt
        let prompt = `
            You are an expert travel agent for India. Generate a personalized, day-by-day travel plan.
            
            **User Preferences:**
            - Interests: ${interests}
            - Duration: ${days} days
            - Budget: Approximately ₹${budget}
            - Language: ${language}
        `;

        // 2. Add location constraints
        if (location && location.trim() !== '') {
            prompt += `\n\n**IMPORTANT:** Focus exclusively on **${location}**. All activities must be in this area.`;
        } else {
            prompt += `\n\n**Suggestions:** You can choose from these famous places: ${locationNames}.`;
        }

        // 3. Add formatting instructions
        prompt += `
            \n**Formatting Instructions:**
            1. Response must be strictly RAW HTML (no markdown code blocks like \`\`\`).
            2. Use <h2> for the title, <h3> for days, and <ul><li> for activities.
            3. Use descriptive <li> tags for activities.
            4. **Language:** The entire response MUST be in ${language}.
        `;

        // 4. API Call using Gemini 2.5 Flash
        // UPDATED MODEL ID: gemini-2.5-flash
        const modelId = "gemini-2.5-flash";
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: prompt }] }],
                    // Optional: You can add thinking_config here if you want reasoning logs
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error("Gemini API Error:", errorBody);
            throw new Error('AI service error.');
        }

        const geminiData = await geminiResponse.json();
        const generatedText = geminiData.candidates[0].content.parts[0].text;
        
        // Clean the HTML (removing any unintended markdown fences)
        const cleanedHtml = cleanGeminiResponse(generatedText);

        res.json({ itinerary: cleanedHtml });

    } catch (err) {
        console.error("Error in AI planner route:", err.message);
        res.status(500).send({ message: 'Error generating your travel plan.' });
    }
});

/**
 * Static list of locations
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
 * Cleans the HTML string
 */
function cleanGeminiResponse(text) {
    return text.replace(/^```(html)?\s*/i, '').replace(/\s*```$/, '').trim();
}

module.exports = router;
