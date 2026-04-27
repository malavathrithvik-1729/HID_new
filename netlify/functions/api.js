console.log("DEBUG: Loading api.js");
console.log("DEBUG: Loading server.js");
import serverless from "serverless-http";
import app from "../../backend/server.js";

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  console.log("DEBUG: Request received");
  try {
    return await serverlessHandler(event, context);
  } catch (error) {
    console.error("Netlify Function Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Internal Server Error", 
        message: error.message,
        stack: error.stack 
      })
    };
  }
};