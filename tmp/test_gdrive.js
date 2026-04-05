
import fetch from "node-fetch";

function getDriveId(url) {
    const docRegex = /\/document\/d\/([a-zA-Z0-9-_]+)/;
    const fileRegex = /\/file\/d\/([a-zA-Z0-9-_]+)/;
    const ucRegex = /id=([a-zA-Z0-9-_]+)/;

    let match = url.match(docRegex) || url.match(fileRegex) || url.match(ucRegex);
    return match ? match[1] : null;
}

async function testExtraction(url) {
    const id = getDriveId(url);
    if (!id) {
        console.log("Invalid URL");
        return;
    }

    // Try as Google Doc export
    const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
    console.log(`Trying export URL: ${exportUrl}`);
    
    try {
        const res = await fetch(exportUrl);
        if (res.ok) {
            const text = await res.text();
            console.log("Extracted text (first 100 chars):", text.slice(0, 100));
            return;
        } else {
            console.log(`Export failed with status: ${res.status}`);
        }
    } catch (e) {
        console.log(`Export error: ${e.message}`);
    }

    // Try as direct file download (for PDF/Image)
    const downloadUrl = `https://drive.google.com/uc?id=${id}&export=download`;
    console.log(`Trying download URL: ${downloadUrl}`);
    try {
        const res = await fetch(downloadUrl);
        if (res.ok) {
            console.log(`Download successful. Content-Type: ${res.headers.get("content-type")}`);
            // Note: downloading full file might be heavy.
        } else {
            console.log(`Download failed with status: ${res.status}`);
        }
    } catch (e) {
        console.log(`Download error: ${e.message}`);
    }
}

// Example URL (publicly shared)
const testUrl = "https://docs.google.com/document/d/1X4vV9p9_5N7h_v9Xp9_5N7h_v9Xp9_5N7h_v9Xp9_5/edit";
testExtraction(testUrl);
