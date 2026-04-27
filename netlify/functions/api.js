import serverless from "serverless-http";

export const handler = async (event, context) => {
  try {
    const module = await import("../../backend/server.js");
    const app = module.default || module;
    
    // Log for debugging (will show in Netlify logs)
    console.log("DEBUG: App loaded. Type:", typeof app);
    if (app && app.handle) {
       console.log("DEBUG: App looks like an express app");
    } else {
       console.log("DEBUG: App keys:", Object.keys(app || {}));
    }

    const serverlessHandler = serverless(app);
    return await serverlessHandler(event, context);
  } catch (error) {
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