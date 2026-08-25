/**
 * V-Med ID — Dynamic Health Score Calculator Engine
 * Evaluates vitals, active medications, visit frequency, and risk factors.
 */
import { db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function calculateHealthScore(userProfile) {
  let score = 100;
  const breakdown = {
    vitalsScore: 40,
    medicationScore: 25,
    visitScore: 20,
    riskScore: 15
  };

  if (!userProfile) {
    return { score: 75, grade: "Good", breakdown, lastCalculated: new Date().toISOString() };
  }

  const vitals = userProfile.vitalsHistory?.[userProfile.vitalsHistory.length - 1] || {};
  const medications = userProfile.medications || [];
  const visits = userProfile.visits || [];

  // 1. Vitals Check (Max 40 pts)
  let vitalsPoints = 40;
  if (vitals.bpSys) {
    const sys = parseInt(vitals.bpSys, 10);
    if (sys > 140 || sys < 90) vitalsPoints -= 8;
    else if (sys > 130) vitalsPoints -= 4;
  }
  if (vitals.bpDia) {
    const dia = parseInt(vitals.bpDia, 10);
    if (dia > 90 || dia < 60) vitalsPoints -= 7;
  }
  if (vitals.bloodSugar) {
    const sugar = parseInt(vitals.bloodSugar, 10);
    if (sugar > 180 || sugar < 70) vitalsPoints -= 10;
    else if (sugar > 140) vitalsPoints -= 5;
  }
  if (vitals.spo2) {
    const spo2 = parseInt(vitals.spo2, 10);
    if (spo2 < 92) vitalsPoints -= 10;
    else if (spo2 < 95) vitalsPoints -= 4;
  }
  breakdown.vitalsScore = Math.max(0, vitalsPoints);

  // 2. Medications Check (Max 25 pts)
  let medPoints = 25;
  const activeMeds = medications.filter(m => m.status !== "completed" && m.active !== false);
  if (activeMeds.length > 3) medPoints -= 10;
  else if (activeMeds.length > 1) medPoints -= 5;
  breakdown.medicationScore = Math.max(0, medPoints);

  // 3. Visit Recency (Max 20 pts)
  let visitPoints = 20;
  if (visits.length === 0) {
    visitPoints -= 5; // no visit on record
  } else {
    const lastVisit = new Date(visits[visits.length - 1].date);
    const monthsDiff = (new Date() - lastVisit) / (1000 * 60 * 60 * 24 * 30);
    if (monthsDiff > 12) visitPoints -= 10;
    else if (monthsDiff > 6) visitPoints -= 5;
  }
  breakdown.visitScore = Math.max(0, visitPoints);

  // 4. Chronic Conditions & Emergency Profile (Max 15 pts)
  let riskPoints = 15;
  const conds = userProfile.patientData?.conditions || "";
  if (conds.length > 0) riskPoints -= 5;
  breakdown.riskScore = Math.max(0, riskPoints);

  const totalScore = breakdown.vitalsScore + breakdown.medicationScore + breakdown.visitScore + breakdown.riskScore;

  let grade = "Excellent";
  if (totalScore < 60) grade = "Needs Attention";
  else if (totalScore < 75) grade = "Fair";
  else if (totalScore < 88) grade = "Good";

  return {
    score: totalScore,
    grade,
    breakdown,
    lastCalculated: new Date().toISOString()
  };
}

/**
 * Calculates and persists health score in Firestore for a patient
 */
export async function syncHealthScore(userId, userProfile) {
  if (!userId || !userProfile) return null;
  const scoreData = calculateHealthScore(userProfile);
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, { healthScore: scoreData });
  } catch (e) {
    console.warn("Health score sync skipped or failed:", e);
  }
  return scoreData;
}
