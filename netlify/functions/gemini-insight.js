// netlify/functions/gemini-insight.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { title, description } = JSON.parse(event.body);

    if (!title || !description) {
      return { statusCode: 400, body: 'Missing required fields: title or description' };
    }

    // Construct the prompt for the Gemini LLM
    const prompt = `Analyze the following security alert and provide a concise summary and a brief, actionable insight or recommendation.
    
    Alert Title: "${title}"
    Alert Description: "${description}"
    
    Format your response as:
    Summary: [Concise summary]
    Insight: [Brief actionable insight/recommendation]`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    // Call the Gemini API
    const payload = { contents: chatHistory };
    const apiKey = ""; // Canvas will automatically provide this at runtime
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // Parse the Gemini response
    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const geminiText = result.candidates[0].content.parts[0].text;
      return {
        statusCode: 200,
        body: JSON.stringify({ insight: geminiText }),
      };
    } else {
      console.error('Gemini API response structure unexpected:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to get insight from Gemini API: Unexpected response structure' }),
      };
    }

  } catch (error) {
    console.error('Error generating Gemini insight:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate Gemini insight', details: error.message }),
    };
  }
};
