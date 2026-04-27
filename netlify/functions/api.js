import serverless from "serverless-http";

export const handler = async (event, context) => {
  let debugInfo = {};
  try {
    const module = await import("../../backend/server.js");
    const app = module.default || module;
    
    debugInfo = {
      appType: typeof app,
      hasHandle: !!(app && app.handle),
      keys: Object.keys(app || {}),
      isDefaultExport: !!module.default
    };

    const serverlessHandler = serverless(app);
    return await serverlessHandler(event, context);
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        debugInfo,
        stack: error.stack
      })
    };
  }
};