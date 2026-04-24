const fs = require('fs');

function generateVitals(days, baseBP, baseSugar, basePulse) {
    const history = [];
    const now = new Date();
    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        
        // Add some noise
        const bpSys = baseBP + Math.floor(Math.random() * 15) - 5;
        const bpDia = 80 + Math.floor(Math.random() * 10) - 5;
        const sugar = baseSugar + Math.floor(Math.random() * 20) - 10;
        const pulse = basePulse + Math.floor(Math.random() * 10) - 5;
        
        history.push({
            mapValue: {
                fields: {
                    date: { stringValue: date.toLocaleDateString('en-GB') },
                    bp: { stringValue: `${bpSys}/${bpDia}` },
                    sugar: { stringValue: String(sugar) },
                    pulse: { stringValue: String(pulse) },
                    temp: { stringValue: "98.6" },
                    weight: { stringValue: "72" },
                    verified: { booleanValue: i % 5 === 0 } // Verify every 5th entry
                }
            }
        });
    }
    return history;
}

const rahulVitals = generateVitals(30, 135, 110, 72);
const aditiVitals = generateVitals(15, 120, 145, 78);

console.log("RAHUL_VITALS_JSON:");
console.log(JSON.stringify(rahulVitals, null, 2));
console.log("\nADITI_VITALS_JSON:");
console.log(JSON.stringify(aditiVitals, null, 2));
