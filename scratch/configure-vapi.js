const apiKey = process.env.VAPI_API_KEY;

if (!apiKey || apiKey.includes('your_')) {
  console.error("Error: VAPI_API_KEY environment variable is missing or placeholder.");
  console.log("Please run this command: VAPI_API_KEY=sk_... node scratch/configure-vapi.js");
  process.exit(1);
}

async function configureAssistant() {
  console.log("Configuring Chloe Voice Agent on Vapi...");

  const assistantPayload = {
    name: "Chloe - PaintLead Pro Receptionist",
    voice: {
      provider: "playht",
      voiceId: "susan" // Premium natural-sounding female voice
    },
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Chloe, an automated outbound calling agent for PaintLead Pro. Your job is to verify newly submitted house painting leads.
Be friendly, professional, and concise.

Conversation flow:
1. Greet the customer: "Hi {{customerName}}, this is Chloe with PaintLead Pro. I just received your visualizer quote request for the {{projectScope}} in Greenville!"
2. Verify the color choice: "I see you selected {{chosenColor}} as your preferred Sherwin-Williams color. It's a very popular shade! The visualizer estimate range for this project is {{projectBudget}}. Does that budget range match your expectations?"
3. Confirm timeline and book walk: "Great! I am scheduling one of our certified in-network contractors to call you within 15 minutes to lock in a site walk date. Thank you so much for choosing PaintLead Pro!"

Always remain polite. If they have questions about detailed rates, tell them the local painting contractor will provide a complete written itemized bid during the walk.`
        }
      ]
    },
    firstMessage: "Hi {{customerName}}, this is Chloe with PaintLead Pro. I just received your visualizer quote request for the {{projectScope}} in Greenville!",
    recordingEnabled: true,
    endCallPhrases: ["thank you", "goodbye", "have a great day"]
  };

  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(assistantPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create assistant');
    }

    console.log("\n==================================================");
    console.log("🎉 Chloe Voice Agent Created Successfully!");
    console.log(`Assistant ID: ${data.id}`);
    console.log("==================================================");
    console.log(`Please copy this Assistant ID and add it as:`);
    console.log(`VAPI_ASSISTANT_ID=${data.id}`);
    console.log("==================================================\n");

  } catch (error) {
    console.error("Vapi API Request failed:", error.message);
  }
}

configureAssistant();
