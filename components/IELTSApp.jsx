"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Topic Modules ────────────────────────────────────────────────────────────
const TOPICS = [
  { id: "work",        label: "Work & Career",   icon: "💼", sub: "Jobs, ambitions, workplace" },
  { id: "education",   label: "Education",        icon: "📚", sub: "School, learning, studying" },
  { id: "travel",      label: "Travel",           icon: "✈️", sub: "Places, tourism, experiences" },
  { id: "technology",  label: "Technology",       icon: "💻", sub: "Gadgets, internet, social media" },
  { id: "environment", label: "Environment",      icon: "🌿", sub: "Climate, nature, sustainability" },
  { id: "family",      label: "Family",           icon: "👨‍👩‍👧", sub: "Home, relationships, life" },
  { id: "health",      label: "Health",           icon: "🏃", sub: "Exercise, diet, wellbeing" },
  { id: "culture",     label: "Culture & Arts",   icon: "🎭", sub: "Music, traditions, festivals" },
  { id: "sports",      label: "Sports & Hobbies", icon: "⚽", sub: "Games, leisure, pastimes" },
];

// ─── API — calls our own secure server route, not Anthropic directly ─────────
async function ai(msgs, sys = "", max = 2000) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: max, system: sys, messages: msgs }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.map((b) => b.text || "").join("");
}

// ─── Text-to-Speech ───────────────────────────────────────────────────────────
function speak(text, cb) {
  if (!window.speechSynthesis) { setTimeout(() => cb?.(), 500); return; }
  window.speechSynthesis.cancel();
  const doSpeak = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.84; u.pitch = 1.0;
    const vs = window.speechSynthesis.getVoices();
    const v = vs.find((x) => x.name.includes("UK English Female"))
      || vs.find((x) => x.lang === "en-GB")
      || vs.find((x) => x.lang.startsWith("en-"))
      || vs[0];
    if (v) u.voice = v;
    let done = false;
    const fin = () => { if (!done) { done = true; cb?.(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, text.split(" ").length * 430 + 2500);
    window.speechSynthesis.speak(u);
  };
  const vs = window.speechSynthesis.getVoices();
  if (vs.length > 0) doSpeak();
  else { window.speechSynthesis.onvoiceschanged = doSpeak; }
}

// ─── Build Flat Step List ─────────────────────────────────────────────────────
function buildSteps(d) {
  const s = [];
  const E = (id, text, part) => s.push({ id, type: "examiner", part, text });
  const U = (id, part) => s.push({ id, type: "user", part });

  E("open", `Good morning! My name is Sarah, and I'll be your IELTS examiner today. I'd like to start with some questions about yourself. ${d.part1Questions[0]}`, 1);
  U("open-u", 1);
  d.part1Questions.slice(1).forEach((q, i) => { E(`p1-${i}`, q, 1); U(`p1-${i}-u`, 1); });

  E("p2t", "Thank you. Now we'll move on to Part 2 of the test. I'm going to give you a topic. You'll have one minute to think about it, then I'll ask you to speak for one to two minutes. You may make notes. Here is your topic.", 2);
  s.push({ id: "p2-card", type: "cue-card", part: 2, card: d.part2Card });
  s.push({ id: "p2-prep", type: "prep-timer", part: 2, duration: 60 });
  s.push({ id: "p2-speak", type: "user-timed", part: 2, duration: 120 });
  d.part2FollowUps.forEach((q, i) => { E(`p2f-${i}`, i === 0 ? `Thank you. ${q}` : q, 2); U(`p2f-${i}-u`, 2); });

  E("p3t", `We've been talking about ${d.topic}. Now I'd like to discuss some more general questions related to this theme.`, 3);
  d.part3Questions.forEach((q, i) => { E(`p3-${i}`, q, 3); U(`p3-${i}-u`, 3); });

  s.push({ id: "close", type: "closing", part: 3, text: "Thank you very much. That is the end of the IELTS Speaking test. Well done for completing it. Please wait while I prepare your detailed feedback report." });
  return s;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const ft  = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const bc  = (b) => b >= 7.5 ? "#4ADE80" : b >= 6.5 ? "#60A5FA" : b >= 5.5 ? "#FBBF24" : "#F87171";
const PC  = [null, "#60A5FA", "#C084FC", "#34D399"];
const PL  = [null, "Part 1 — Introduction & Interview", "Part 2 — Individual Long Turn", "Part 3 — Two-way Discussion"];

// ─────────────────────────────────────────────────────────────────────────────
export default function IELTSApp() {
  const [screen,    setScreen]    = useState("home");
  const [topicId,   setTopicId]   = useState(null);
  const [freestyle, setFreestyle] = useState(false);
  const [examTopic, setExamTopic] = useState("");
  const [loadMsg,   setLoadMsg]   = useState("");
  const [steps,     setSteps]     = useState([]);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [msgs,      setMsgs]      = useState([]);
  const [phase,     setPhase]     = useState("idle");
  const [timer,     setTimer]     = useState(0);
  const [micOn,     setMicOn]     = useState(false);
  const [liveText,  setLiveText]  = useState("");
  const [feedback,  setFeedback]  = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const stepsR    = useRef([]);
  const stepIdxR  = useRef(0);
  const msgsR     = useRef([]);
  const phaseR    = useRef("idle");
  const liveTextR = useRef("");
  const recogR    = useRef(null);
  const timerR    = useRef(null);
  const procRef   = useRef(null);
  const bottomR   = useRef(null);

  useEffect(() => { stepsR.current    = steps;    }, [steps]);
  useEffect(() => { stepIdxR.current  = stepIdx;  }, [stepIdx]);
  useEffect(() => { msgsR.current     = msgs;     }, [msgs]);
  useEffect(() => { phaseR.current    = phase;    }, [phase]);
  useEffect(() => { liveTextR.current = liveText; }, [liveText]);
  useEffect(() => { if (screen === "exam") bottomR.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, screen]);

  const addMsg = useCallback((msg) => {
    setMsgs((p) => { const u = [...p, { ...msg, key: `${Date.now()}-${Math.random()}` }]; msgsR.current = u; return u; });
  }, []);

  const finalizeUser = useCallback((text) => {
    setMsgs((p) => {
      const u = [...p];
      for (let i = u.length - 1; i >= 0; i--) {
        if (u[i].role === "user-live") { u[i] = { ...u[i], role: "user", text: text || "(no response recorded)" }; break; }
      }
      msgsR.current = u; return u;
    });
  }, []);

  const stopAll = useCallback(() => {
    clearInterval(timerR.current);
    window.speechSynthesis?.cancel();
    try { recogR.current?.stop(); } catch (_) {}
    setMicOn(false);
  }, []);

  const startMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addMsg({ role: "system", text: "⚠️ Speech recognition not available. Please use Chrome on Android or desktop." }); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    let acc = "";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) acc += e.results[i][0].transcript + " ";
        else live += e.results[i][0].transcript;
      }
      const full = (acc + live).trim();
      setLiveText(full); liveTextR.current = full;
    };
    r.onend = () => { if (phaseR.current === "listening") { try { r.start(); } catch (_) {} } };
    r.onerror = (e) => { if (e.error !== "no-speech") console.warn("STT:", e.error); };
    r.start(); recogR.current = r; setMicOn(true);
  }, [addMsg]);

  const submitAnswer = useCallback((idxOverride) => {
    clearInterval(timerR.current);
    try { recogR.current?.stop(); } catch (_) {}
    setMicOn(false);
    const text = liveTextR.current.trim();
    finalizeUser(text);
    setLiveText(""); liveTextR.current = "";
    setPhase("idle"); phaseR.current = "idle";
    const i = idxOverride ?? stepIdxR.current;
    setTimeout(() => procRef.current?.(i + 1), 700);
  }, [finalizeUser]);

  const processStep = useCallback((idx) => {
    const L = stepsR.current;
    if (!L || idx >= L.length) return;
    const s = L[idx];
    setStepIdx(idx); stepIdxR.current = idx;

    switch (s.type) {
      case "examiner":
        setPhase("speaking"); phaseR.current = "speaking";
        addMsg({ role: "examiner", text: s.text, part: s.part });
        speak(s.text, () => procRef.current?.(idx + 1));
        break;
      case "user":
        setPhase("listening"); phaseR.current = "listening";
        setLiveText(""); liveTextR.current = "";
        addMsg({ role: "user-live", text: "", part: s.part });
        startMic();
        break;
      case "cue-card":
        addMsg({ role: "cue-card", card: s.card, part: s.part });
        procRef.current?.(idx + 1);
        break;
      case "prep-timer":
        setPhase("prep"); phaseR.current = "prep";
        let prepT = s.duration; setTimer(prepT);
        timerR.current = setInterval(() => {
          prepT--; setTimer(prepT);
          if (prepT <= 0) {
            clearInterval(timerR.current);
            const gm = "Your preparation time is up. Please begin speaking now.";
            addMsg({ role: "examiner", text: gm, part: s.part });
            speak(gm, () => procRef.current?.(idx + 1));
          }
        }, 1000);
        break;
      case "user-timed":
        setPhase("listening"); phaseR.current = "listening";
        setLiveText(""); liveTextR.current = "";
        addMsg({ role: "user-live", text: "", part: s.part });
        startMic();
        let speakT = s.duration; setTimer(speakT);
        timerR.current = setInterval(() => {
          speakT--; setTimer(speakT);
          if (speakT <= 0) { clearInterval(timerR.current); submitAnswer(idx); }
        }, 1000);
        break;
      case "closing":
        setPhase("done"); phaseR.current = "done";
        addMsg({ role: "examiner", text: s.text, part: s.part });
        speak(s.text, () => doFeedback());
        break;
    }
  }, [addMsg, startMic, submitAnswer]);

  useEffect(() => { procRef.current = processStep; }, [processStep]);

  const generateExam = useCallback(async (tid, isFs) => {
    setScreen("gen"); stopAll();
    setMsgs([]); msgsR.current = [];
    setLiveText(""); liveTextR.current = "";
    setFeedback(null); setActiveTab("overview");
    setLoadMsg("Preparing your IELTS examiner…");

    const label = isFs
      ? "a random everyday topic (e.g. food, cities, music, seasons — not work or education)"
      : TOPICS.find((t) => t.id === tid)?.label;

    const sys = "You are an IELTS Speaking exam generator. Output ONLY valid JSON. No markdown, no backticks, no comments.";
    const prompt = `Generate a complete IELTS Speaking exam on the topic: "${label}".

Return ONLY this exact JSON structure:
{
  "topic": "2–3 word display name",
  "part1Questions": ["question 1","question 2","question 3","question 4"],
  "part2Card": {
    "title": "Describe [a specific person/place/event/object]…",
    "points": ["• a specific first aspect","• a second aspect","• a third aspect","• a fourth aspect"],
    "closing": "and explain why it was meaningful / how it made you feel"
  },
  "part2FollowUps": ["follow-up question 1","follow-up question 2"],
  "part3Questions": ["question 1","question 2","question 3","question 4","question 5"]
}

Rules:
- Part 1: Personal, familiar, about the candidate's own life and opinions
- Part 2: Describe a specific memory, person, place, or object (classic IELTS cue card style)
- Part 3: Abstract, societal, analytical (clearly harder than Part 1)
- All questions must sound natural and be authentic IELTS-style`;

    try {
      setLoadMsg("Generating questions…");
      const raw = await ai([{ role: "user", content: prompt }], sys, 1200);
      const data = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setExamTopic(data.topic);
      const built = buildSteps(data);
      setSteps(built); stepsR.current = built;
      setStepIdx(0); stepIdxR.current = 0;
      setPhase("idle"); phaseR.current = "idle";
      setScreen("exam");
      setTimeout(() => procRef.current?.(0), 900);
    } catch (e) {
      setLoadMsg("⚠️ Error generating exam. Returning home…");
      setTimeout(() => setScreen("home"), 3000);
    }
  }, [stopAll]);

  const doFeedback = useCallback(async () => {
    setScreen("eval"); setLoadMsg("Analyzing your responses…");

    const convo = msgsR.current
      .filter((m) => m.role === "examiner" || m.role === "user")
      .map((m) => `[${m.role === "examiner" ? "EXAMINER" : "CANDIDATE"} | Part ${m.part}]: ${m.text}`)
      .join("\n\n");

    const sys = "You are a senior IELTS Speaking examiner with 20+ years of experience. Provide detailed, honest, and specific feedback in valid JSON only.";
    const prompt = `Evaluate this IELTS Speaking test transcript. Answers were captured via speech-to-text, so minor transcription errors may exist.

TRANSCRIPT:
${convo}

Return ONLY this JSON:
{
  "overallBand": 6.0,
  "examinerNote": "2 specific sentences about the candidate's overall performance.",
  "criteria": {
    "fluency": { "band": 6.0, "label": "Fluency & Coherence", "icon": "💬", "comment": "Specific 2–3 sentence assessment.", "tips": ["tip1","tip2","tip3"] },
    "lexical": { "band": 6.0, "label": "Lexical Resource", "icon": "📖", "comment": "Specific 2–3 sentence assessment.", "tips": ["tip1","tip2","tip3"], "upgrades": [{"used":"phrase from their answer","better":"more sophisticated alternative"}] },
    "grammar": { "band": 6.0, "label": "Grammatical Range & Accuracy", "icon": "✏️", "comment": "Specific 2–3 sentence assessment.", "tips": ["tip1","tip2","tip3"], "corrections": [{"wrong":"error they made","correct":"corrected version","rule":"brief rule"}] },
    "pronunciation": { "band": 6.0, "label": "Pronunciation", "icon": "🎙️", "comment": "Specific 2–3 sentence assessment.", "tips": ["tip1","tip2","tip3"] }
  },
  "strengths": ["strength 1","strength 2","strength 3"],
  "improvements": ["improvement 1","improvement 2","improvement 3"],
  "naturalSpeech": [
    { "context": "When asked about...", "candidate": "what they said", "natural": "more fluent version", "why": "brief reason" }
  ],
  "closing": "Warm encouraging message referencing their actual performance."
}`;

    try {
      setLoadMsg("Generating feedback report…");
      const raw = await ai([{ role: "user", content: prompt }], sys, 2500);
      const fb = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setFeedback(fb); setScreen("feedback");
    } catch (e) {
      setFeedback({ error: true }); setScreen("feedback");
    }
  }, []);

  // ─── CSS ─────────────────────────────────────────────────────────────────────
  const globalCss = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #1E2D40; border-radius: 4px; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  `;
  const app = { fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: "#0C1117", color: "#E2E8F0", minHeight: "100vh" };

  // ════════════════════════════════════════════════════════════════════════════
  // HOME
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === "home") return (
    <div style={{ ...app, padding: "28px 16px 48px" }}>
      <style>{globalCss}</style>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#141B24", border: "1px solid #1E2D40", borderRadius: 40, padding: "5px 14px", marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "blink 2s ease-in-out infinite" }} />
            <span style={{ color: "#94A3B8", fontSize: 12, fontWeight: 500 }}>AI Examiner Online</span>
          </div>
          <h1 style={{ fontSize: "clamp(26px,6vw,40px)", fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 10 }}>
            IELTS Speaking<br />
            <span style={{ background: "linear-gradient(90deg,#60A5FA,#C084FC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Practice Exam</span>
          </h1>
          <p style={{ color: "#64748B", fontSize: 15, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
            A full 3-part AI mock exam with a real examiner voice, speech recognition, and band score feedback.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {[{ label:"Part 1",sub:"Interview",color:"#60A5FA",time:"~5 min" },{ label:"Part 2",sub:"Long Turn",color:"#C084FC",time:"~4 min" },{ label:"Part 3",sub:"Discussion",color:"#34D399",time:"~5 min" }].map(p => (
            <div key={p.label} style={{ flex:1,background:"#141B24",border:"1px solid #1E2D40",borderRadius:12,padding:"12px 10px",textAlign:"center" }}>
              <div style={{ color:p.color,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5 }}>{p.label}</div>
              <div style={{ fontSize:13,fontWeight:600,marginTop:2 }}>{p.sub}</div>
              <div style={{ color:"#475569",fontSize:11,marginTop:1 }}>{p.time}</div>
            </div>
          ))}
        </div>

        <div style={{ color:"#475569",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12 }}>Select a Practice Module</div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10 }}>
          {TOPICS.map(t => {
            const active = topicId === t.id && !freestyle;
            return (
              <button key={t.id} onClick={() => { setTopicId(t.id); setFreestyle(false); }}
                style={{ background:active?"#162033":"#141B24",border:`1px solid ${active?"#60A5FA":"#1E2D40"}`,borderRadius:12,padding:"14px 8px",cursor:"pointer",color:"#E2E8F0",textAlign:"center",transition:"all .15s",outline:"none" }}>
                <div style={{ fontSize:28,marginBottom:5 }}>{t.icon}</div>
                <div style={{ fontSize:12,fontWeight:600,lineHeight:1.3 }}>{t.label}</div>
                <div style={{ fontSize:10,color:"#475569",marginTop:3 }}>{t.sub}</div>
              </button>
            );
          })}
        </div>

        <button onClick={() => { setFreestyle(true); setTopicId(null); }}
          style={{ width:"100%",padding:"13px 16px",borderRadius:12,cursor:"pointer",background:freestyle?"#1A1440":"#141B24",border:`1px solid ${freestyle?"#C084FC":"#1E2D40"}`,color:"#E2E8F0",fontSize:14,fontWeight:600,marginBottom:20,display:"flex",alignItems:"center",justifyContent:"center",gap:10,outline:"none" }}>
          <span style={{ fontSize:20 }}>✨</span>
          AI Freestyle — Surprise me with a random topic
        </button>

        <button disabled={!topicId && !freestyle} onClick={() => generateExam(topicId, freestyle)}
          style={{ width:"100%",padding:18,borderRadius:14,fontSize:17,fontWeight:800,cursor:!topicId&&!freestyle?"not-allowed":"pointer",background:!topicId&&!freestyle?"#1E2D40":"linear-gradient(135deg,#3B82F6 0%,#8B5CF6 100%)",color:!topicId&&!freestyle?"#475569":"#fff",border:"none",letterSpacing:0.3,outline:"none" }}>
          Begin Full Mock Exam →
        </button>

        <div style={{ marginTop:16,padding:12,background:"#141B24",borderRadius:10,border:"1px solid #1E2D40",textAlign:"center" }}>
          <p style={{ margin:0,color:"#475569",fontSize:12 }}>🎙️ Requires <strong style={{ color:"#94A3B8" }}>Google Chrome</strong> on Android or desktop · Allow microphone when prompted</p>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // GENERATING
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === "gen") return (
    <div style={{ ...app,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <style>{globalCss}</style>
      <div style={{ textAlign:"center",padding:40 }}>
        <div style={{ width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#3B82F6,#8B5CF6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 20px",animation:"spin 2.5s linear infinite" }}>👩‍💼</div>
        <h2 style={{ fontSize:22,fontWeight:700,marginBottom:8 }}>Preparing Your Examiner</h2>
        <p style={{ color:"#64748B",fontSize:14 }}>{loadMsg}</p>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // EXAM
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === "exam") {
    const currStep = steps[stepIdx];
    const currPart = currStep?.part || 1;
    const pColor = PC[currPart];
    const isListen = phase === "listening";
    const isPrep = phase === "prep";
    const isTalking = phase === "speaking";
    const showTimer = isPrep || (isListen && currStep?.type === "user-timed");

    return (
      <div style={{ ...app,display:"flex",flexDirection:"column",height:"100vh",maxHeight:"100dvh" }}>
        <style>{globalCss}</style>
        <div style={{ background:"#0E1520",borderBottom:"1px solid #1E2D40",padding:"10px 16px",flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <div>
              <div style={{ color:pColor,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6 }}>{PL[currPart]}</div>
              <div style={{ color:"#475569",fontSize:11,marginTop:1 }}>Topic: {examTopic}</div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              {showTimer && (
                <div style={{ background:timer<15?"#450A0A":"#141B24",color:timer<15?"#F87171":"#E2E8F0",border:`1px solid ${timer<15?"#7F1D1D":"#1E2D40"}`,padding:"4px 12px",borderRadius:20,fontSize:13,fontWeight:700,fontFamily:"monospace",transition:"all .3s" }}>
                  {isPrep ? `⏱ Prep ${ft(timer)}` : `🎙 ${ft(timer)}`}
                </div>
              )}
              <div style={{ width:10,height:10,borderRadius:"50%",background:isListen&&micOn?"#4ADE80":isTalking?"#C084FC":"#1E2D40",boxShadow:isListen&&micOn?"0 0 10px #4ADE8060":"none",animation:(isListen&&micOn)?"pulse 1.5s ease-in-out infinite":"none" }} />
            </div>
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:"14px 14px 6px" }}>
          {msgs.map(m => {
            if (m.role === "cue-card") return (
              <div key={m.key} style={{ background:"linear-gradient(135deg,#1A1F3A,#1E2A48)",border:"2px solid #4F46E5",borderRadius:16,padding:18,margin:"12px 0",animation:"slideUp .3s ease" }}>
                <div style={{ color:"#818CF8",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10 }}>📋 Part 2 — Task Card</div>
                <div style={{ fontSize:16,fontWeight:700,marginBottom:14,lineHeight:1.4 }}>{m.card.title}</div>
                <div style={{ color:"#94A3B8",fontSize:12,marginBottom:8,fontStyle:"italic" }}>You should say:</div>
                {m.card.points.map((p,i) => <div key={i} style={{ fontSize:14,color:"#E2E8F0",padding:"3px 0",lineHeight:1.6 }}>{p}</div>)}
                {m.card.closing && <div style={{ color:"#818CF8",fontSize:13,marginTop:10,fontStyle:"italic" }}>…{m.card.closing}</div>}
              </div>
            );
            if (m.role === "system") return <div key={m.key} style={{ textAlign:"center",padding:"6px 0",color:"#FBBF24",fontSize:12 }}>{m.text}</div>;
            const isExaminer = m.role === "examiner";
            const isLive = m.role === "user-live";
            const isUser = m.role === "user" || isLive;
            return (
              <div key={m.key} style={{ display:"flex",justifyContent:isExaminer?"flex-start":"flex-end",alignItems:"flex-end",gap:8,marginBottom:12,animation:"slideUp .25s ease" }}>
                {isExaminer && <div style={{ width:34,height:34,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#1D4ED8,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>👩‍💼</div>}
                <div style={{ maxWidth:"76%",padding:"11px 15px",lineHeight:1.65,fontSize:14,borderRadius:16,borderBottomLeftRadius:isExaminer?4:16,borderBottomRightRadius:isUser?4:16,background:isExaminer?"#1A2744":isLive?"#0B1F14":"#0D3620",border:isLive?"1px dashed #4ADE8055":"none",color:isLive&&!liveText?"#475569":"#E2E8F0" }}>
                  {isExaminer && <div style={{ fontSize:10,color:"#818CF8",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.6 }}>Examiner Sarah</div>}
                  {isLive ? (liveText||"🎙 Listening…") : m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomR} style={{ height:8 }} />
        </div>

        <div style={{ background:"#0E1520",borderTop:"1px solid #1E2D40",padding:"14px 16px 18px",flexShrink:0 }}>
          {isListen && (
            <div>
              {liveText && <div style={{ background:"#0A1220",border:"1px solid #1E2D40",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:13,color:"#94A3B8",maxHeight:64,overflowY:"auto",lineHeight:1.6 }}>{liveText}</div>}
              <div style={{ display:"flex",gap:10 }}>
                <div style={{ flex:1,display:"flex",alignItems:"center",gap:10,background:"#0A1220",borderRadius:12,padding:"12px 16px",border:"1px solid #163220" }}>
                  <div style={{ width:10,height:10,borderRadius:"50%",background:"#4ADE80",flexShrink:0,animation:"pulse 1.4s ease-in-out infinite" }} />
                  <span style={{ color:"#4ADE80",fontSize:13,fontWeight:600 }}>{micOn?"Recording — speak now":"Starting microphone…"}</span>
                </div>
                <button onClick={() => submitAnswer()} style={{ background:"#3B82F6",color:"#fff",border:"none",borderRadius:12,padding:"0 22px",fontWeight:700,fontSize:14,cursor:"pointer",flexShrink:0,outline:"none" }}>Done ✓</button>
              </div>
            </div>
          )}
          {isPrep && (
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
              <div style={{ color:"#94A3B8",fontSize:13,lineHeight:1.5 }}>📝 Think about what you'll say. Take notes if you need.</div>
              <button onClick={() => { clearInterval(timerR.current); setPhase("idle"); phaseR.current="idle"; const gm="Alright, please begin speaking now."; addMsg({role:"examiner",text:gm,part:2}); speak(gm,()=>procRef.current?.(stepIdxR.current+1)); }}
                style={{ background:"#141B24",color:"#94A3B8",border:"1px solid #1E2D40",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",flexShrink:0,fontWeight:600,outline:"none" }}>
                Ready →
              </button>
            </div>
          )}
          {isTalking && <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10,color:"#64748B",fontSize:13 }}><div style={{ width:8,height:8,borderRadius:"50%",background:"#C084FC",animation:"pulse 1s ease-in-out infinite" }} />Examiner is speaking…</div>}
          {(phase==="idle"||phase==="done") && <div style={{ textAlign:"center",color:"#475569",fontSize:13 }}>{phase==="done"?"⏳ Generating your feedback…":"Preparing next question…"}</div>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVALUATING
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === "eval") return (
    <div style={{ ...app,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <style>{globalCss}</style>
      <div style={{ textAlign:"center",padding:40 }}>
        <div style={{ fontSize:60,marginBottom:18 }}>📊</div>
        <h2 style={{ fontSize:22,fontWeight:700,marginBottom:8 }}>Analyzing Your Performance</h2>
        <p style={{ color:"#64748B",fontSize:14 }}>{loadMsg}</p>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // FEEDBACK
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === "feedback") {
    if (!feedback||feedback.error) return (
      <div style={{ ...app,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <style>{globalCss}</style>
        <div style={{ textAlign:"center",padding:40 }}>
          <div style={{ fontSize:48,marginBottom:16 }}>⚠️</div>
          <h2 style={{ fontSize:20,marginBottom:8 }}>Couldn't generate feedback</h2>
          <button onClick={() => setScreen("home")} style={{ background:"#3B82F6",color:"#fff",border:"none",padding:"12px 28px",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer" }}>Return Home</button>
        </div>
      </div>
    );

    const { overallBand, examinerNote, criteria={}, strengths=[], improvements=[], naturalSpeech=[], closing } = feedback;
    const criteriaList = Object.values(criteria);

    return (
      <div style={{ ...app,padding:"24px 14px 48px" }}>
        <style>{globalCss}</style>
        <div style={{ maxWidth:720,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:28 }}>
            <div style={{ fontSize:36,marginBottom:10 }}>📋</div>
            <h1 style={{ fontSize:24,fontWeight:900,marginBottom:4,letterSpacing:-0.5 }}>Your Feedback Report</h1>
            <p style={{ color:"#475569",fontSize:13 }}>Full Mock Exam · <span style={{ color:"#94A3B8" }}>Topic: {examTopic}</span></p>
            <div style={{ display:"inline-flex",alignItems:"center",gap:20,flexWrap:"wrap",justifyContent:"center",background:"#141B24",border:"1px solid #1E2D40",borderRadius:18,padding:"18px 28px",marginTop:18,marginBottom:16 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:60,fontWeight:900,color:bc(overallBand),lineHeight:1,letterSpacing:-2 }}>{overallBand}</div>
                <div style={{ color:"#475569",fontSize:11,textTransform:"uppercase",letterSpacing:1,marginTop:4 }}>Overall Band</div>
              </div>
              <div style={{ borderLeft:"1px solid #1E2D40",paddingLeft:20 }}>
                {[9,8,7,6,5,4].map(n => (
                  <div key={n} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:2 }}>
                    <span style={{ fontSize:12,fontWeight:800,color:bc(n),width:16 }}>{n}</span>
                    <span style={{ fontSize:11,color:n<=Math.round(overallBand)?"#94A3B8":"#2D3748" }}>{n===9?"Expert":n===8?"Very Good":n===7?"Good":n===6?"Competent":n===5?"Modest":"Limited"}</span>
                  </div>
                ))}
              </div>
            </div>
            {examinerNote && <p style={{ color:"#94A3B8",fontSize:14,lineHeight:1.75,maxWidth:520,margin:"0 auto" }}>{examinerNote}</p>}
          </div>

          <div style={{ display:"flex",gap:6,marginBottom:20,background:"#141B24",borderRadius:12,padding:4 }}>
            {[{id:"overview",label:"Overview"},{id:"language",label:"Language"},{id:"expressions",label:"Natural Speech"}].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ flex:1,padding:"9px 8px",border:"none",borderRadius:10,cursor:"pointer",background:activeTab===t.id?"#0C1117":"transparent",color:activeTab===t.id?"#E2E8F0":"#475569",fontSize:13,fontWeight:600,outline:"none",transition:"all .15s" }}>{t.label}</button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div style={{ animation:"slideUp .2s ease" }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20 }}>
                {criteriaList.map((c,i) => (
                  <div key={i} style={{ background:"#141B24",border:"1px solid #1E2D40",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12 }}>
                    <div style={{ fontSize:22 }}>{c.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11,color:"#64748B",marginBottom:2 }}>{c.label}</div>
                      <div style={{ height:4,background:"#1E2D40",borderRadius:2 }}><div style={{ width:`${(c.band/9)*100}%`,height:"100%",background:bc(c.band),borderRadius:2 }} /></div>
                    </div>
                    <div style={{ fontSize:22,fontWeight:900,color:bc(c.band),flexShrink:0 }}>{c.band}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
                <div style={{ background:"#091510",border:"1px solid #163020",borderRadius:14,padding:16 }}>
                  <div style={{ color:"#4ADE80",fontWeight:700,fontSize:14,marginBottom:12 }}>✅ What You Did Well</div>
                  {strengths.map((s,i) => <div key={i} style={{ fontSize:12,color:"#94A3B8",marginBottom:8,paddingLeft:10,borderLeft:"2px solid #4ADE80",lineHeight:1.6 }}>{s}</div>)}
                </div>
                <div style={{ background:"#130A0A",border:"1px solid #301515",borderRadius:14,padding:16 }}>
                  <div style={{ color:"#F87171",fontWeight:700,fontSize:14,marginBottom:12 }}>📈 Priority Improvements</div>
                  {improvements.map((s,i) => <div key={i} style={{ fontSize:12,color:"#94A3B8",marginBottom:8,paddingLeft:10,borderLeft:"2px solid #F87171",lineHeight:1.6 }}>{s}</div>)}
                </div>
              </div>
              {closing && <div style={{ background:"#141B24",border:"1px solid #3B82F633",borderRadius:14,padding:18,textAlign:"center" }}><div style={{ fontSize:22,marginBottom:8 }}>⭐</div><p style={{ color:"#94A3B8",fontSize:14,lineHeight:1.8,margin:0 }}>{closing}</p></div>}
            </div>
          )}

          {activeTab === "language" && (
            <div style={{ display:"flex",flexDirection:"column",gap:14,animation:"slideUp .2s ease" }}>
              {criteriaList.map((c,i) => (
                <div key={i} style={{ background:"#141B24",border:"1px solid #1E2D40",borderRadius:14,padding:18 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}><span style={{ fontSize:22 }}>{c.icon}</span><div style={{ fontWeight:700,fontSize:15 }}>{c.label}</div></div>
                    <div style={{ fontSize:32,fontWeight:900,color:bc(c.band),letterSpacing:-1 }}>{c.band}</div>
                  </div>
                  <div style={{ height:5,background:"#1E2D40",borderRadius:3,marginBottom:14 }}><div style={{ width:`${(c.band/9)*100}%`,height:"100%",background:bc(c.band),borderRadius:3 }} /></div>
                  <p style={{ color:"#94A3B8",fontSize:13,lineHeight:1.7,marginBottom:14 }}>{c.comment}</p>
                  {c.tips?.length>0 && <div style={{ marginBottom:14 }}><div style={{ fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Tips</div>{c.tips.map((t,j) => <div key={j} style={{ display:"flex",gap:8,marginBottom:6,alignItems:"flex-start" }}><span style={{ color:"#60A5FA",fontSize:14,flexShrink:0,marginTop:1 }}>→</span><span style={{ color:"#94A3B8",fontSize:13,lineHeight:1.5 }}>{t}</span></div>)}</div>}
                  {c.upgrades?.length>0 && <div style={{ marginBottom:10 }}><div style={{ fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Vocabulary Upgrades</div>{c.upgrades.map((u,j) => <div key={j} style={{ background:"#0A1220",borderRadius:10,padding:"10px 12px",marginBottom:8 }}><div style={{ color:"#F87171",fontSize:13,marginBottom:4 }}>You said: <em>"{u.used}"</em></div><div style={{ color:"#4ADE80",fontSize:13 }}>Better: <strong>"{u.better}"</strong></div></div>)}</div>}
                  {c.corrections?.length>0 && <div><div style={{ fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Grammar Corrections</div>{c.corrections.map((x,j) => <div key={j} style={{ background:"#0A1220",borderRadius:10,padding:"10px 12px",marginBottom:8 }}><div style={{ color:"#F87171",fontSize:13,marginBottom:4 }}>❌ <em>"{x.wrong}"</em></div><div style={{ color:"#4ADE80",fontSize:13,marginBottom:x.rule?6:0 }}>✅ <strong>"{x.correct}"</strong></div>{x.rule&&<div style={{ color:"#475569",fontSize:11 }}>💡 {x.rule}</div>}</div>)}</div>}
                </div>
              ))}
            </div>
          )}

          {activeTab === "expressions" && (
            <div style={{ animation:"slideUp .2s ease" }}>
              {naturalSpeech.length===0
                ? <div style={{ textAlign:"center",padding:48,color:"#475569" }}>No natural speech suggestions for this session.</div>
                : <div>
                    <p style={{ color:"#64748B",fontSize:13,lineHeight:1.65,marginBottom:20 }}>Real examples from your answers, rewritten to sound more natural — the kind of language that scores higher bands.</p>
                    {naturalSpeech.map((e,i) => (
                      <div key={i} style={{ background:"#141B24",border:"1px solid #1E2D40",borderRadius:14,padding:18,marginBottom:14,animation:"slideUp .2s ease" }}>
                        <div style={{ color:"#64748B",fontSize:12,marginBottom:12,fontStyle:"italic" }}>📌 {e.context}</div>
                        <div style={{ background:"#0A1220",borderRadius:10,padding:"12px 14px",marginBottom:10 }}>
                          <div style={{ fontSize:11,color:"#F87171",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5 }}>You said</div>
                          <div style={{ color:"#CBD5E1",fontSize:14,lineHeight:1.6 }}>"{e.candidate}"</div>
                        </div>
                        <div style={{ background:"#091510",borderRadius:10,padding:"12px 14px",marginBottom:10,border:"1px solid #163020" }}>
                          <div style={{ fontSize:11,color:"#4ADE80",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5 }}>Try saying</div>
                          <div style={{ color:"#E2E8F0",fontSize:14,fontWeight:600,lineHeight:1.6 }}>"{e.natural}"</div>
                        </div>
                        {e.why && <div style={{ display:"flex",gap:8,alignItems:"flex-start" }}><span style={{ color:"#FBBF24",fontSize:14 }}>💡</span><span style={{ color:"#64748B",fontSize:12,lineHeight:1.6 }}>{e.why}</span></div>}
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

          <div style={{ display:"flex",gap:10,marginTop:24 }}>
            <button onClick={() => { stopAll(); setScreen("home"); setFeedback(null); setMsgs([]); }} style={{ flex:1,padding:16,fontSize:15,fontWeight:800,border:"none",borderRadius:12,cursor:"pointer",background:"linear-gradient(135deg,#3B82F6 0%,#8B5CF6 100%)",color:"#fff",outline:"none" }}>Practice Again</button>
            <button onClick={() => { setFeedback(null); setMsgs([]); generateExam(topicId,freestyle); }} style={{ padding:"16px 18px",fontSize:13,fontWeight:600,border:"1px solid #1E2D40",borderRadius:12,cursor:"pointer",background:"#141B24",color:"#94A3B8",outline:"none" }}>Retry Topic</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
