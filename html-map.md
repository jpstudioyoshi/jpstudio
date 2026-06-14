# Japanese Studio — HTML ID Map
Generated from index.html grep. Use this before touching any panel.

---

## Top-level panels (`id="panel-*"`)

| Panel ID | showPanel() key | Description |
|---|---|---|
| `panel-settings` | `settings` | Settings — tabs: Settings / Context / Grammar |
| `panel-dashboard` | `dashboard` | Yoshi chat / agent |
| `panel-kana` | `kana` | Kana drill + stroke lookup + words drill |
| `panel-words` | `words` | Vocab card + Anki + Counters + Days + Game |
| `panel-gramref` | `gramref` | Grammar reference list |
| `panel-gramnotes` | `gramnotes` | Grammar notes + Kanji corpus + Lookups |
| `panel-vocab-corpus` | `vocab-corpus` | Vocab corpus table |
| `panel-resources` | `resources` | Resource links |
| `panel-writing` | `writing` | Writing input + feedback board |
| `panel-translate` | `translate` | Translation + breakdown tabs |
| `panel-read` | `read` | Quick reader + EPUB reader |
| `panel-listening` | `listening` | Audio player + dictation + SRS + comprehension |
| `panel-voice` | `voice` | Voice conversation + drill + custom drill |
| `panel-video` | `video` | Video player + transcript + shadowing |
| `panel-recordings` | `recordings` | Recordings browser |
| `panel-lessonnotes` | `lessonnotes` | Lesson notes |
| `panel-progress` | `progress` | Progress briefing + mastery charts |
| `panel-grammar2` | `grammar2` | Conjugation drill + sentence drill + particles |

---

## Nav buttons

| Button ID | Target panel |
|---|---|
| `progressNavBtn` | `progress` |
| `grammar2NavBtn` | `grammar2` |
| `kanaNavBtn` | `kana` |

---

## Global quick translate bar

| ID | Role |
|---|---|
| `globalQuickTranslate` | Container |
| `globalQTInput` | Text input |
| `globalQTHistoryBtn` | History dropdown trigger |
| `globalQTHistoryMenu` | Dropdown container |
| `globalQTResult` | Result display |
| `globalQTSpeakBtn` | TTS button |

---

## panel-settings

| ID | Role |
|---|---|
| `stTabSettings` / `stTabContext` / `stTabGrammar` | Tab buttons |
| `stPaneSettings` / `stPaneContext` / `stPaneGrammar` | Tab panes |
| `apikeyInput` / `apikeyBtn` / `apikeyStatus` | Anthropic key |
| `openaiKeyInput` / `openaiKeyBtn` / `openaiKeyStatus` | OpenAI key |
| `ttsVoiceSelect` / `ttsVoiceHint` | TTS voice |
| `vvToggle` / `vvStatus` / `vvSpeakerSel` | VoiceVox |
| `micSelect` / `micTestBtn` / `micLevel` / `micLevelBar` / `micStatus` | Microphone |
| `settingFurigana` | Furigana toggle |
| `settingDefaultLevel` | Default level |
| `settingPrintFontSize` / `settingPrintLineHeight` | Print settings |
| `goalKanaDrillSize` / `goalWordsDrillSize` / `goalConjQuestionsPerRun` / `goalConjSessionRuns` / `goalSstGapDays` / `goalSstMinUtterances` | Goals selects |
| `prog-backup-msg` | Backup status |
| `progress-cost-display` | API cost display |
| `stContextDisplay` | Context pane content |
| `stGrammarOverrideGrid` | Grammar weight overrides |

---

## panel-dashboard

| ID | Role |
|---|---|
| `chatHistoryToggle` / `chatHistoryDrawer` / `chatHistoryList` | Chat history drawer |
| `agentStrip` | Agent status strip |
| `chatInput` | Chat textarea |
| `chatMessages` | Message thread |

---

## panel-kana

| ID | Role |
|---|---|
| `kanaDakutenLabel` / `kanaDakutenCheck` | Dakuten toggle |
| `kanaTimerRow` / `kanaTimerSelect` | Timer controls |
| `kanaRightSlot` | Right slot container |
| `kanaStrokeInputRow` / `strokeReadingsDisplay` / `strokeMeaningDisplay` / `strokeWordMeaning` | Stroke input row |
| `strokeInputWrap` / `strokeSearchInput` / `strokeEditBtn` / `strokeKanjiBtn` / `strokeEditWrap` | Stroke search |
| `strokeTilesInline` / `strokeTiles` / `strokeDisplay` | Stroke tiles |
| `drillCorrect` / `drillWrong` / `drillRemaining` | Drill counters |
| `kanaSessionInfo` | Session info |
| `timerDisplay` / `timerVal` / `timerBarWrap` / `timerBar` | Timer UI |
| `drillProgress` / `drillChar` / `kanaTtsBtn` | Drill card |
| `kanaWordHint` / `feedbackMsg` | Feedback |
| `answerInput` / `skipKanaBtn` | Answer input |
| `wordsDrillOptions` / `wordsChallengeMode` / `wordsCategorySelect` / `wordsCategoryLabel` | Words drill options |
| `wordsMultiChoice` | Multi-choice area |
| `kanaProgressLabel` / `kanaGridToggleBtn` / `kanaGrid` | Kana grid |
| `kanaStrokesPanel` | Strokes panel |

---

## panel-words (subtabs via `words-sub-*`)

| ID | Role |
|---|---|
| `wordsSubSelect` | Subtab dropdown |
| **words-sub-vocab** | |
| `vocabCounter` | Card count |
| `vocabCard` / `vcJp` / `vcReading` / `vcPitch` / `vcEn` / `vcBackReading` / `vcPos` | Vocab card faces |
| `vocabDeckStatus` | Deck status |
| `vocabList` | Word list (hidden) |
| `vcReadingToggle` / `vcPitchToggle` / `vcDirectionBtn` / `vocabResetBtn` / `vocabListToggleBtn` / `vocabListPrintBtn` | Controls |
| **words-sub-anki** | |
| `ankiStatus` / `ankiStatusDot` / `ankiStatusText` | Anki connection |
| `ankiDeckSelector` / `ankiDeckSelect` / `ankiDueCount` / `ankiDirBtn` | Deck selector |
| `ankiReviewCard` / `ankiCardFront` / `ankiCardBack` / `ankiAudioBar` / `ankiShowBtn` / `ankiRatingBtns` | Review card |
| `ankiReviewedCount` / `ankiRemainingCount` / `ankiEmpty` / `ankiSetup` | Anki status |
| **words-sub-counters** | |
| `countRunIndicator2` / `countQIndicator2` / `countCorrect2` / `countWrong2` | Counters score |
| `countProgress2` / `countDrillArea2` / `countPrompt2` / `countPromptEmoji2` / `countPromptText2` | Counters drill |
| `countAnswer2` / `countCheckBtn2` / `countNextBtn2` / `countLookupBtn2` / `countFeedback2` / `countFeedbackText2` | Counters input |
| `countRefGrid2` / `countObjectModeBtn` | Counters reference |
| **words-sub-days** | |
| `daysStopBtn` / `daysDrillArea` / `daysDrillPrompt` / `daysDrillInput` / `daysDrillFeedback` / `daysDrillNext` | Days drill |
| `daysOfMonthTable` / `daysTableToggle` | Days reference table |
| **words-sub-game** | |
| `mg-setup` / `mg-cat-grid` / `mg-game` / `mg-matched` / `mg-total` / `mg-timer` / `mg-kanji-col` / `mg-emoji-col` | Match game |
| `mg-result` / `mg-result-emoji` / `mg-result-msg` / `mg-result-detail` | Game result |

---

## panel-gramnotes

| ID | Role |
|---|---|
| `gramNotesSubSelect` | Subtab select |
| `gramNoteSearch` / `gramNoteSearchResults` | Search |
| `gramnotes-tabs` | Tab container |
| `gnote-tab-{verbs\|adjectives\|particles\|syntax\|expressions\|counters\|misc\|kanji\|lookups}` | Tab panes |
| `gnote-input-{name}` / `gnote-entries-{name}` | Per-tab input + entries |
| `ctrRefGrid` / `ctrCompareA` / `ctrCompareB` / `ctrCompareResult` | Counter reference/compare |
| `kanjiCorpusCount` / `kanjiViewList` / `kanjiViewGrid` / `kanjiCorpusGrid` / `kanjiCorpusDetail` | Kanji corpus |
| `lookupsCount` / `lookupsFilter` / `lookupsTableWrap` / `lookupsTableBody` / `lookupsEmpty` | Lookups cache |

---

## panel-vocab-corpus

| ID | Role |
|---|---|
| `vcN5` / `vcN4` / `vcUnknown` | Level filters |
| `vcCount` | Count label |
| `vcTableBody` / `vcDetail` | Table + detail |

---

## panel-writing

| ID | Role |
|---|---|
| `writingInput` | Main textarea |
| `writingRomajiBtn` / `writingHiraBtn` / `writingKataBtn` / `writingKanjiBtn` / `writingSpeechBtn` | Mode buttons |
| `writingSubmitBtn` | Submit |
| `writingBoard` / `writingBoardEmpty` | Sentence board |
| `feedbackCount` / `feedbackEntries` | Feedback |
| `savedTextsArea` / `savedTextsList` | Saved texts |

---

## panel-translate

| ID | Role |
|---|---|
| `transInput` / `transHistoryBtn` | Input + history |
| `transOutput` / `transOutputBtnRow` / `transAddVocabBtn` | Output |
| `transSessionTab` / `transSessionCount` | Session tab |
| `transBdReading` / `transBdBreakdown` / `transBdGrammar` / `transBdLevel` / `transBdSpelling` / `transBdAlt` / `transBdSession` | Breakdown tabs |
| `transSessionList` / `transSessionEmpty` / `transSessionActions` | Session list |
| `transSpellingInline` / `transSpellingInlineBody` | Spelling inline |

---

## panel-read

| ID | Role |
|---|---|
| `readTabQuick` / `readTabEpub` | Tab buttons |
| `readQuickPane` / `readPasteArea` / `qrInput` | Quick reader |
| `qrSegmentBtn` / `qrRawSpeakBtn` / `qrDownloadTTSBtn` / `qrStatus` | Quick reader actions |
| `qrReaderWrap` / `qrFuriBtn` / `qrSeparateBtn` / `qrListenModeBtn` / `qrBackBtn` / `qrHistorySelect` | Reader controls |
| `qrListenPanel` / `qrSentenceCounter` / `qrSentenceProgress` / `qrCurrentSentence` / `qrListenPrevBtn` / `qrListenPlayBtn` / `qrListenNextBtn` | Listen mode |
| `qrRecordSection` / `qrRecordBtn` / `qrRecordStatus` / `qrSegmentBar` / `qrSegmentCount` / `qrPlayAllBtn` / `qrCombineBtn` / `qrDownloadBtn` / `qrWaveform` | Record section |
| `qrReader` | Reader content |
| `readEpubPane` / `epubDropZone` / `epubFileInput` / `epubReaderWrap` | EPUB reader |
| `epubChapterInfo` / `epubTitle` / `epubFuriBtn` / `epubTtsBtn` / `epubFontSize` / `epubChapterSel` / `epubContent` | EPUB controls |
| `epubWordPopup` / `epubPopupWord` / `epubPopupReading` / `epubPopupMeaning` | EPUB word popup |

---

## panel-listening

| ID | Role |
|---|---|
| `srsToggleBtn` / `srsDueBadge` | SRS |
| `listenFileInput` | File input |
| `dictationPanel` / `dictStandaloneMode` / `dictSaStatus` / `dictationText` / `dictSaHint` / `dictFeedback` / `dictReveal` | Dictation standalone |
| `dictAudioMode` / `dictStatus` / `dictCountdown` / `dictTimeout` / `dictationTextAudio` | Dictation audio mode |
| `listenDropzone` / `listenLayout` / `listenTrackCount` / `listenSelectAll` / `listenPlaylist` | Playlist area |
| `listenTrackName` / `listenTrackMeta` / `loopStatusBar` / `listenWaveform` / `listenWaveMsg` / `loopHintOverlay` | Player display |
| `listenTimeCur` / `listenTimeDur` / `listenAudio` | Time + audio element |
| `listenPlayBtn` / `setLoopBtn` / `listenLoopPause` / `shadowBtn` / `vocabBtn` / `listenSpeedSel` | Transport controls |
| `listenTranscribePanel` / `listenTransMicBtn` / `listenTranscribeText` | Transcribe panel |
| `shadowPanel` / `listenRecModeSingle` / `listenRecModeSegment` / `listenShRecordBtn` / `listenShPlaybackBtn` / `listenMicSelect` / `listenShStatus` / `listenShWaveform` | Shadow panel |
| `listenSegmentPanel` / `listenSegmentCount` / `listenPlayAllBtn` / `listenCombineBtn` / `listenDownloadBtn` / `listenSegmentBar` | Segment panel |
| `vocabBookmarkPanel` / `vocabBookmarkList` / `listenNotes` | Bookmarks + notes |
| `srsRatePanel` / `srsDueCount` / `srsHardDays` / `srsGoodDays` / `srsEasyDays` / `srsNextDue` | SRS rating |
| `listenTips` | Tips |

---

## panel-voice (subtabs via `voice-sub-*`)

| ID | Role |
|---|---|
| `voice-sub-btn-conv` / `voice-sub-btn-drill` / `voice-sub-btn-custom` | Subtab buttons |
| **voice-sub-conv** | |
| `voiceConvoSelect` / `voiceLevel` / `voiceTopic` | Conversation setup |
| `voiceStructuredRow` / `voiceStructuredLabel` / `rtTopicInput` / `rtStartBtn` | Structured mode |
| `rtTranscriptWrap` / `rtTranscriptArea` / `rtStatus` / `rtRound2Btn` / `rtCompareBtn` / `rtReopenBtn` | RT transcript |
| `voiceChatHistory` / `voiceStatus` / `voiceTextInput` / `voiceRecordBtn` / `voiceKeyNotice` | Chat area |
| **voice-sub-drill** | |
| `drillClusterSel` / `drillModeSel` / `drillCounter` / `drillProgBar` | Drill controls |
| `drillCard` / `drillPrompt` / `drillJp` / `drillHearBtn` / `drillResult` / `drillRecordBtn` / `drillStatus` | Drill card |
| **voice-sub-custom** | |
| `cd-view-list` / `cd-doc-list` | Doc list view |
| `cd-view-editor` / `cd-doc-name` / `cd-doc-mode` / `cd-table-body` / `cd-editor-status` | Editor view |
| `cd-view-drill` / `cd-drill-name` / `cd-drill-counter` / `cd-drill-prog` / `cd-drill-prompt` / `cd-drill-answer` / `cd-drill-jp` / `cd-drill-en` / `cd-btn-tts` / `cd-btn-playback` / `cd-drill-score` / `cd-rec-btn` / `cd-rec-status` | Drill view |

---

## panel-video

| ID | Role |
|---|---|
| `vtWatchTimer` / `vtWatchMinutes` | Watch timer |
| `vtInnerWrap` / `vtVideoInput` / `vtTransInput` / `vtFolderInput` / `vtDropZone` | File inputs + drop zone |
| `vtLoadedBar` / `vtLoadedName` | Loaded file bar |
| `vtMainLayout` / `vtVideoCol` / `vtVideo` / `vtNoVideo` | Video layout |
| `vtTranscriptCol` / `vtVocabListOverlay` / `vtVocabListContent` / `vtTranscriptWrap` / `vtTranscript` / `vtNoTranscript` | Transcript col |
| `vtShadowPanel` / `vtShadowHeader` / `vtShTargetPlayBtn` / `vtShTargetTime` / `vtShadowTarget` / `vtShTargetWave` | Shadow panel |
| `vtShRecordBtn` / `vtShPlaybackBtn` / `vtMicSelect` / `vtShRepeat` / `vtShStatus` / `vtShShadowWave` | Shadow controls |
| `vtControls` / `vtMarkerList` / `vtWaveToggleBtn` / `vtWaveform` / `vtWaveMsg` | Transport controls |
| `vtPlayBtn` / `vtTime` / `vtSpeed` / `vtLoopBtn` / `vtLoopPause` / `vtDictateBtn` / `vtBreakdownBtnBar` / `vtFuriAllBtn` / `vtLoopInfo` / `vtHistorySelect` / `vtChangeTransBtn` / `vtChangeVideoBtn` | Control buttons |
| `vtLineTranslate` / `vtLineJp` / `vtLineEn` / `vtBreakdownArea` / `vtBreakdownBtnLine` / `vtBreakdownContentLine` | Line translate panel |
| `vtDictatePanel` / `vtDictateInput` / `vtDictateFeedback` / `vtDictateStats` | Dictate panel |
| `vtBreakdownPopup` / `vtBreakdownLine` / `vtBreakdownContentPopup` | Breakdown popup (fullscreen) |

---

## panel-progress

| ID | Role |
|---|---|
| `agentBriefing` / `agentContextBtn` / `agentClaudeBtn` / `agentContextPanel` | Briefing + context |
| `agentCtx_nativeLang` / `agentCtx_otherLangs` / `agentCtx_currentLevel` / `agentCtx_targetLevel` / `agentCtx_aims` / `agentCtx_dailyTime` / `agentCtx_lessons` / `agentCtx_mastered` / `agentCtx_background` / `agentCtx_other` | Context fields |
| `agentClaudeResponse` / `agentClaudeThread` / `agentFollowUpRow` / `agentFollowUpInput` / `agentFollowUpBtn` | Response + follow-up |
| `drillRecencyGraphic` | Recency graphic |
| `progress-error-chart` / `progress-error-list` / `progress-error-empty` | Error chart |
| `progress-spoken-chart` / `progress-spoken-list` / `progress-spoken-empty` | Spoken chart |
| `conjMasteryPanel` / `adjMasteryPanel` / `counterMasteryPanel` | Mastery panels |
| `gramSentHeatmapWrap` / `gramSentHeatmap` | Heatmap |
| `grammarCoverageGrid` / `grammarDetailPanel` | Coverage grid |

---

## panel-grammar2 (subtabs via `gram2-sub-*`)

| ID | Role |
|---|---|
| `gram2SubSelect` | Subtab select |
| **gram2-sub-conj** | |
| `conjHeaderStats` / `conjFeedbackG` / `conjDrillAreaG` | Conj header + drill area |
| `conjStartBtnG` / `conjNewDrillBtn` / `conjShowEnG` / `conjShowReadingG` / `conjShowTypeG` / `conjListenToggleG` / `conjRefBtnG` | Conj controls |
| `conjFreqVerbCount` | Freq verb count |
| `optUG` / `optRuG` / `optIrrG` / `optRuEndingG` / `optNaIEndingG` | Verb type opts |
| `optPresentG` / `optPastG` / `optTeG` / `optVolG` / `optPassiveG` / `optPotentialG` / `optCausativeG` | Form opts |
| `optAffG` / `optNegG` / `optPoliteG` / `optPlainG` / `optIAdjG` / `optNaAdjG` | Polarity/register opts |
| **gram2-sub-sent** | |
| `gramSentAutoPanel` / `gramSentWeakPoints` / `gramSentAutoEmpty` | Auto mode |
| `gramSentManualPanel` / `gramSentInput` / `gramSentHistory` / `gramSentLevel` / `gramSentModeToggle` / `gramSentTheme` / `gramSentCreateBtn` | Manual mode |
| `gramSentDrillArea` / `gramSentFeedbackCol` / `gramSentFeedback` / `gramSentHintArea` / `gramSentHintText` / `gramSentQuestion` / `gramSentQuestionResult` | Drill + feedback |
| **gram2-sub-particles** | |
| `particlePairSelect` / `pdActionBtn` / `particleDrillArea` | Particle drill |

---

## Overlays / floating panels (outside panel-* divs)

| ID | Role |
|---|---|
| `progressSidebarControls` | Sidebar progress controls |

---

## Notes
- `ttsVoiceSelect` appears twice: settings panel (`ttsVoiceSelect`) and resources panel (`ttsVoiceSelect2`)
- `ttsVoiceHint` appears twice: `ttsVoiceHint` and `ttsVoiceHint2`
