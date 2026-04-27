import serverless from "serverless-http";

export const handler = async (event, context) => {
  console.log("DEBUG: Request received");
  try {
    const { default: app } = await import("../../backend/server.js");
    const serverlessHandler = serverless(app);
    return await serverlessHandler(event, context);
  } catch (error) {
    console.error("Netlify Function Load/Execution Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Internal Server Error", 
        message: error.message,
        stack: error.stack 
      })
    };
  }
};