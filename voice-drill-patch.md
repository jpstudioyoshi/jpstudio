# Voice Panel Subtab Patch

## 1. HTML — insert BEFORE `<div id="panel-voice"` in index.html

Replace the opening of panel-voice:

```html
<!-- VOICE CONVERSATION -->
<div id="panel-voice" class="panel">
  <div class="section-title">...</div>
  
  <div style="background:var(--paper);border:1px solid var(--border);...">
```

With:

```html
<!-- VOICE CONVERSATION -->
<div id="panel-voice" class="panel">
  <div class="section-title"><span class="jp">会話</span><span class="en-block"><span class="reading">かいわ</span><span class="en">(Voice)</span></span></div>

  <!-- Subtab bar -->
  <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px">
    <button class="yoshi-subtab active" id="voice-sub-btn-conv"  onclick="voiceSubSwitch('conv')">🎙 会話</button>
    <button class="yoshi-subtab"        id="voice-sub-btn-drill" onclick="voiceSubSwitch('drill')">練習</button>
    <button class="yoshi-subtab"        id="voice-sub-btn-kiki"  onclick="voiceSubSwitch('kiki')">🆘 緊急</button>
  </div>

  <!-- Sub-panel: voice conversation (existing) -->
  <div id="voice-sub-conv">
    <div style="background:var(--paper);border:1px solid var(--border);border-radius:10px;max-width:700px;margin:0 auto;display:flex;flex-direction:column;height:calc(100vh - 220px);max-height:650px;min-height:400px">
```

And close `voice-sub-conv` just before `</div><!-- end panel-voice -->`:

```html
    </div><!-- end inner voice container -->
  </div><!-- end voice-sub-conv -->

  <!-- Sub-panel: sentence drill -->
  <div id="voice-sub-drill" style="display:none;max-width:700px;margin:0 auto">

    <!-- Cluster filter -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <select id="drillClusterSel" onchange="drillApplyFilter()" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--field);color:var(--ink);font-family:var(--ui);font-size:0.8rem">
        <option value="">All clusters</option>
        <option value="greetings">Greetings</option>
        <option value="social_lubricant">Social</option>
        <option value="introductions">Introductions</option>
        <option value="gratitude">Gratitude</option>
        <option value="interaction">Interaction</option>
        <option value="transactional">Transactional</option>
        <option value="appointment">予約・スケジュール</option>
        <option value="transcript">Transcript</option>
      </select>
      <select id="drillModeSel" onchange="drillApplyFilter()" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--field);color:var(--ink);font-family:var(--ui);font-size:0.8rem">
        <option value="en-to-jp">English → speak Japanese</option>
        <option value="jp-repeat">Japanese → repeat</option>
      </select>
      <span id="drillCounter" style="margin-left:auto;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light)"></span>
    </div>

    <!-- Progress bar -->
    <div style="height:3px;background:var(--border);border-radius:2px;margin-bottom:14px">
      <div id="drillProgBar" style="height:100%;background:var(--teal);border-radius:2px;transition:width 0.3s;width:0%"></div>
    </div>

    <!-- Card -->
    <div id="drillCard" style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:28px 24px;text-align:center;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:14px">
      <div id="drillPrompt" style="font-size:1.05rem;color:var(--ink-light);margin-bottom:12px;font-family:var(--ui)"></div>
      <div id="drillJp" style="font-size:1.5rem;color:var(--ink);font-family:'Noto Sans JP',var(--ui);line-height:1.6;display:none"></div>
      <button id="drillHearBtn" onclick="drillSpeak()" style="display:none;margin-top:10px" class="btn-ghost">🔊 Hear it</button>
      <div id="drillResult" style="margin-top:14px;font-size:0.9rem;display:none"></div>
    </div>

    <!-- Controls -->
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px">
      <button class="btn-ghost" onclick="drillPrev()">← Prev</button>
      <button id="drillRecordBtn" onclick="drillToggleRecord()" style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,var(--teal),#28b8ad);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.5rem;transition:all 0.2s;box-shadow:0 2px 10px rgba(48,213,200,0.3)">🎙️</button>
      <button class="btn-ghost" onclick="drillNext()">Next →</button>
    </div>
    <div id="drillStatus" style="text-align:center;font-family:var(--ui);font-size:0.78rem;color:var(--ink-light);min-height:18px"></div>

    <!-- Score row -->
    <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
      <button class="btn-ghost" style="border-color:var(--red);color:var(--red)" onclick="drillMark('again')">✕ Again</button>
      <button class="btn-ghost" style="border-color:var(--teal);color:var(--teal)" onclick="drillMark('ok')">〜 OK</button>
      <button class="btn-primary" onclick="drillMark('known')">✓ Known</button>
    </div>
  </div><!-- end voice-sub-drill -->

  <!-- Sub-panel: emergency phrases -->
  <div id="voice-sub-kiki" style="display:none;max-width:700px;margin:0 auto">
    <div style="background:rgba(255,50,50,0.07);border:1px solid rgba(255,80,80,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-family:var(--ui);font-size:0.8rem;color:var(--ink-light)">
      These phrases are for reference — tap any to hear it.
    </div>
    <div id="kikiList"></div>
  </div><!-- end voice-sub-kiki -->

</div><!-- end panel-voice -->
```
