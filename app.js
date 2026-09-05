(function () {
  "use strict";

  var EXAM_SIZE = 40;
  var EXAM_TIME_SECONDS = 65 * 60;
  var PASS_PERCENT = 70;
  var HISTORY_KEY = "pcapHistory";
  var HISTORY_LIMIT = 50;

  var state = {
    mode: null,
    questions: [],
    currentIndex: 0,
    answers: {},
    flagged: {},
    timeLimitSeconds: EXAM_TIME_SECONDS,
    remainingSeconds: EXAM_TIME_SECONDS,
    timerInterval: null,
    currentSelection: new Set(),
    practiceChecked: false,
    practiceResults: []
  };

  var el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (var v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  function correctIndexSet(question) {
    var s = new Set();
    question.options.forEach(function (opt, i) {
      if (opt.isCorrect) s.add(i);
    });
    return s;
  }

  function formatTime(totalSeconds) {
    var s = Math.max(0, totalSeconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function showConfirmModal(message, options) {
    options = options || {};
    el.confirmModalMessage.textContent = message;
    el.confirmModalOk.textContent = options.okText || "Confirm";
    el.confirmModal.hidden = false;

    function cleanup() {
      el.confirmModal.hidden = true;
      el.confirmModalOk.removeEventListener("click", onOk);
      el.confirmModalCancel.removeEventListener("click", onCancel);
      el.confirmModal.removeEventListener("click", onOverlayClick);
    }
    function onOk() {
      cleanup();
      if (options.onConfirm) options.onConfirm();
    }
    function onCancel() {
      cleanup();
    }
    function onOverlayClick(e) {
      if (e.target === el.confirmModal) onCancel();
    }

    el.confirmModalOk.addEventListener("click", onOk);
    el.confirmModalCancel.addEventListener("click", onCancel);
    el.confirmModal.addEventListener("click", onOverlayClick);
  }

  function showScreen(name) {
    ["home", "exam", "practice", "results"].forEach(function (s) {
      $("screen-" + s).hidden = s !== name;
    });
  }

  // ---------- History ----------

  function loadHistory() {
    try {
      var raw = JSON.parse(localStorage.getItem(HISTORY_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistoryEntry(entry) {
    var history = loadHistory();
    history.unshift(entry);
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      /* storage unavailable; ignore */
    }
  }

  function clearAllHistory() {
    showConfirmModal("Clear all attempt history?", {
      okText: "Clear",
      onConfirm: function () {
        try {
          localStorage.removeItem(HISTORY_KEY);
        } catch (e) {
          /* ignore */
        }
        renderHomeHistory();
      }
    });
  }

  function renderHomeHistory() {
    var history = loadHistory();
    el.historyBody.innerHTML = "";
    if (history.length === 0) {
      el.historyEmpty.hidden = false;
      el.historyTable.hidden = true;
      return;
    }
    el.historyEmpty.hidden = true;
    el.historyTable.hidden = false;
    history.forEach(function (entry) {
      var tr = document.createElement("tr");

      var dateTd = document.createElement("td");
      dateTd.textContent = new Date(entry.date).toLocaleString();

      var modeTd = document.createElement("td");
      modeTd.textContent = entry.mode === "exam" ? "Exam" : "Practice";

      var scoreTd = document.createElement("td");
      scoreTd.textContent = entry.correctCount + "/" + entry.totalQuestions + " (" + entry.scorePercent + "%)";

      var resultTd = document.createElement("td");
      if (entry.mode === "exam") {
        resultTd.textContent = entry.passed ? "Passed" : "Failed";
        resultTd.className = entry.passed ? "pass-text" : "fail-text";
      } else {
        resultTd.textContent = "—";
      }

      tr.appendChild(dateTd);
      tr.appendChild(modeTd);
      tr.appendChild(scoreTd);
      tr.appendChild(resultTd);
      el.historyBody.appendChild(tr);
    });
  }

  // ---------- Exam mode ----------

  function buildExamQuestions() {
    var byCategory = {};
    QUESTIONS.forEach(function (q) {
      if (!byCategory[q.category]) byCategory[q.category] = [];
      byCategory[q.category].push(q);
    });
    var categories = Object.keys(byCategory);
    var total = QUESTIONS.length;
    var examSize = Math.min(EXAM_SIZE, total);

    var quotas = {};
    categories.forEach(function (cat) {
      quotas[cat] = Math.min(
        byCategory[cat].length,
        Math.round((byCategory[cat].length / total) * examSize)
      );
    });

    var sum = categories.reduce(function (acc, c) {
      return acc + quotas[c];
    }, 0);
    var diff = examSize - sum;
    var sortedCats = categories.slice().sort(function (a, b) {
      return byCategory[b].length - byCategory[a].length;
    });

    var guard = 0;
    while (diff !== 0 && guard < 1000) {
      for (var i = 0; i < sortedCats.length && diff !== 0; i++) {
        var cat = sortedCats[i];
        if (diff > 0 && quotas[cat] < byCategory[cat].length) {
          quotas[cat]++;
          diff--;
        } else if (diff < 0 && quotas[cat] > 0) {
          quotas[cat]--;
          diff++;
        }
      }
      guard++;
    }

    var selected = [];
    categories.forEach(function (cat) {
      selected = selected.concat(shuffle(byCategory[cat]).slice(0, quotas[cat]));
    });
    return shuffle(selected);
  }

  function startExam() {
    state.mode = "exam";
    state.questions = buildExamQuestions();
    state.currentIndex = 0;
    state.answers = {};
    state.flagged = {};
    state.timeLimitSeconds = EXAM_TIME_SECONDS;
    state.remainingSeconds = EXAM_TIME_SECONDS;

    showScreen("exam");
    renderExamQuestion();
    startExamTimer();
  }

  function startExamTimer() {
    clearInterval(state.timerInterval);
    updateTimerDisplay();
    state.timerInterval = setInterval(function () {
      state.remainingSeconds--;
      updateTimerDisplay();
      if (state.remainingSeconds <= 0) {
        clearInterval(state.timerInterval);
        finishExam(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    el.examTimer.textContent = formatTime(state.remainingSeconds);
    el.examTimer.classList.toggle("warning", state.remainingSeconds <= 300 && state.remainingSeconds > 0);
  }

  function renderExamQuestion() {
    var q = state.questions[state.currentIndex];
    el.examProgress.textContent = "Question " + (state.currentIndex + 1) + " / " + state.questions.length;
    el.examCategory.textContent = q.category;
    el.examQuestionText.textContent = q.question;

    if (q.code) {
      el.examCode.hidden = false;
      el.examCode.querySelector("code").textContent = q.code;
    } else {
      el.examCode.hidden = true;
    }

    renderExamOptions(q);

    var isFlagged = !!state.flagged[q.id];
    el.examFlagBtn.classList.toggle("active", isFlagged);
    el.examFlagBtn.textContent = isFlagged ? "🚩 Flagged" : "🚩 Flag for review";

    el.examPrevBtn.disabled = state.currentIndex === 0;
    el.examNextBtn.disabled = state.currentIndex === state.questions.length - 1;

    renderExamPalette();
  }

  function renderExamOptions(question) {
    el.examOptions.innerHTML = "";
    var selected = state.answers[question.id] || new Set();
    question.options.forEach(function (opt, idx) {
      var label = document.createElement("label");
      label.className = "option" + (selected.has(idx) ? " selected" : "");

      var input = document.createElement("input");
      input.type = question.multi ? "checkbox" : "radio";
      input.name = "exam-option";
      input.checked = selected.has(idx);
      input.addEventListener("change", function () {
        handleExamOptionChange(question, idx);
      });

      var span = document.createElement("span");
      span.textContent = opt.text;

      label.appendChild(input);
      label.appendChild(span);
      el.examOptions.appendChild(label);
    });
  }

  function handleExamOptionChange(question, idx) {
    if (!state.answers[question.id]) state.answers[question.id] = new Set();
    var set = state.answers[question.id];
    if (question.multi) {
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
    } else {
      set.clear();
      set.add(idx);
    }
    renderExamQuestion();
  }

  function renderExamPalette() {
    el.examPalette.innerHTML = "";
    state.questions.forEach(function (q, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item";
      btn.textContent = String(idx + 1);
      if (idx === state.currentIndex) btn.classList.add("current");
      if (state.flagged[q.id]) {
        btn.classList.add("flagged");
      } else if (state.answers[q.id] && state.answers[q.id].size > 0) {
        btn.classList.add("answered");
      }
      btn.addEventListener("click", function () {
        state.currentIndex = idx;
        renderExamQuestion();
      });
      el.examPalette.appendChild(btn);
    });
  }

  function submitExamFlow() {
    var unanswered = state.questions.filter(function (q) {
      return !state.answers[q.id] || state.answers[q.id].size === 0;
    }).length;

    var message =
      unanswered > 0
        ? "You have " + unanswered + " unanswered question" + (unanswered === 1 ? "" : "s") + ". Submit anyway?"
        : "Submit the exam now?";

    showConfirmModal(message, { okText: "Submit", onConfirm: function () { finishExam(false); } });
  }

  function exitExamFlow() {
    showConfirmModal("Exit exam? Your progress will not be saved.", {
      okText: "Exit",
      onConfirm: function () {
        clearInterval(state.timerInterval);
        goHome();
      }
    });
  }

  function finishExam(timedOut) {
    clearInterval(state.timerInterval);
    var timeUsedSeconds = state.timeLimitSeconds - Math.max(0, state.remainingSeconds);

    var categoryBreakdown = {};
    var correctCount = 0;
    var reviewItems = state.questions.map(function (q) {
      var correctSet = correctIndexSet(q);
      var selectedSet = state.answers[q.id] || new Set();
      var isCorrect = setsEqual(selectedSet, correctSet);
      if (isCorrect) correctCount++;

      if (!categoryBreakdown[q.category]) categoryBreakdown[q.category] = { correct: 0, total: 0 };
      categoryBreakdown[q.category].total++;
      if (isCorrect) categoryBreakdown[q.category].correct++;

      return { question: q, selectedSet: selectedSet, correctSet: correctSet, isCorrect: isCorrect };
    });

    var scorePercent = Math.round((correctCount / state.questions.length) * 100);
    var entry = {
      id: genId(),
      date: new Date().toISOString(),
      mode: "exam",
      totalQuestions: state.questions.length,
      correctCount: correctCount,
      scorePercent: scorePercent,
      passed: scorePercent >= PASS_PERCENT,
      timeUsedSeconds: timeUsedSeconds,
      categoryBreakdown: categoryBreakdown,
      timedOut: !!timedOut
    };

    saveHistoryEntry(entry);
    renderResults({ mode: "exam", entry: entry, reviewItems: reviewItems });
    showScreen("results");
  }

  // ---------- Practice mode ----------

  function startPractice() {
    state.mode = "practice";
    state.questions = shuffle(QUESTIONS.slice());
    state.currentIndex = 0;
    state.practiceResults = [];
    showScreen("practice");
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    var q = state.questions[state.currentIndex];
    el.practiceProgress.textContent = "Question " + (state.currentIndex + 1) + " / " + state.questions.length;

    var correctSoFar = state.practiceResults.filter(function (r) {
      return r.isCorrect;
    }).length;
    el.practiceScore.textContent = "Score: " + correctSoFar + " / " + state.practiceResults.length;

    el.practiceCategory.textContent = q.category;
    el.practiceQuestionText.textContent = q.question;

    if (q.code) {
      el.practiceCode.hidden = false;
      el.practiceCode.querySelector("code").textContent = q.code;
    } else {
      el.practiceCode.hidden = true;
    }

    state.currentSelection = new Set();
    state.practiceChecked = false;
    el.practiceFeedback.hidden = true;
    el.practiceCheckBtn.hidden = false;
    el.practiceCheckBtn.disabled = true;
    el.practiceNextBtn.hidden = true;

    renderPracticeOptions(q);
  }

  function renderPracticeOptions(question) {
    el.practiceOptions.innerHTML = "";
    question.options.forEach(function (opt, idx) {
      var label = document.createElement("label");
      label.className = "option";

      var input = document.createElement("input");
      input.type = question.multi ? "checkbox" : "radio";
      input.name = "practice-option";
      input.addEventListener("change", function () {
        if (question.multi) {
          if (input.checked) state.currentSelection.add(idx);
          else state.currentSelection.delete(idx);
        } else {
          state.currentSelection.clear();
          state.currentSelection.add(idx);
        }
        el.practiceCheckBtn.disabled = state.currentSelection.size === 0;
        Array.prototype.forEach.call(el.practiceOptions.children, function (child, i) {
          child.classList.toggle("selected", state.currentSelection.has(i));
        });
      });

      var span = document.createElement("span");
      span.textContent = opt.text;

      label.appendChild(input);
      label.appendChild(span);
      el.practiceOptions.appendChild(label);
    });
  }

  function checkPracticeAnswer() {
    if (state.practiceChecked || state.currentSelection.size === 0) return;
    var q = state.questions[state.currentIndex];
    var correctSet = correctIndexSet(q);
    var selectedSet = new Set(state.currentSelection);
    var isCorrect = setsEqual(selectedSet, correctSet);

    state.practiceChecked = true;
    state.practiceResults.push({ question: q, selectedSet: selectedSet, correctSet: correctSet, isCorrect: isCorrect });

    Array.prototype.forEach.call(el.practiceOptions.children, function (child, i) {
      child.querySelector("input").disabled = true;
      if (correctSet.has(i)) child.classList.add("is-correct-answer");
      if (selectedSet.has(i) && !correctSet.has(i)) child.classList.add("is-wrong-selected");
    });

    el.practiceVerdict.textContent = isCorrect ? "✔ Correct" : "✘ Incorrect";
    el.practiceVerdict.className = "feedback-verdict " + (isCorrect ? "correct" : "incorrect");
    el.practiceExplanation.textContent = q.explanation;
    el.practiceFeedback.hidden = false;

    el.practiceCheckBtn.hidden = true;
    el.practiceNextBtn.hidden = false;
    el.practiceNextBtn.textContent = state.currentIndex === state.questions.length - 1 ? "Finish" : "Next Question →";

    var correctSoFar = state.practiceResults.filter(function (r) {
      return r.isCorrect;
    }).length;
    el.practiceScore.textContent = "Score: " + correctSoFar + " / " + state.practiceResults.length;
  }

  function nextPracticeQuestion() {
    if (state.currentIndex === state.questions.length - 1) {
      finishPractice();
    } else {
      state.currentIndex++;
      renderPracticeQuestion();
    }
  }

  function exitPracticeFlow() {
    showConfirmModal("End practice now? Your progress will not be saved.", {
      okText: "End Practice",
      onConfirm: goHome
    });
  }

  function finishPractice() {
    var categoryBreakdown = {};
    var correctCount = 0;
    state.practiceResults.forEach(function (r) {
      var cat = r.question.category;
      if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { correct: 0, total: 0 };
      categoryBreakdown[cat].total++;
      if (r.isCorrect) {
        categoryBreakdown[cat].correct++;
        correctCount++;
      }
    });

    var scorePercent = Math.round((correctCount / state.practiceResults.length) * 100);
    var entry = {
      id: genId(),
      date: new Date().toISOString(),
      mode: "practice",
      totalQuestions: state.practiceResults.length,
      correctCount: correctCount,
      scorePercent: scorePercent,
      categoryBreakdown: categoryBreakdown
    };

    saveHistoryEntry(entry);
    renderResults({ mode: "practice", entry: entry, reviewItems: null });
    showScreen("results");
  }

  // ---------- Results ----------

  function renderResults(data) {
    var mode = data.mode;
    var entry = data.entry;

    el.resultsBanner.className = "results-banner";
    if (mode === "exam") {
      el.resultsBanner.classList.add(entry.passed ? "pass" : "fail");
      el.resultsBanner.textContent = (entry.passed ? "Passed — " : "Not Passed — ") + entry.scorePercent + "%";
    } else {
      el.resultsBanner.classList.add("practice");
      el.resultsBanner.textContent = "Practice Complete — " + entry.scorePercent + "%";
    }

    el.resultsScorePercent.textContent = entry.scorePercent + "%";
    el.resultsCorrectCount.textContent = entry.correctCount + " / " + entry.totalQuestions;

    if (mode === "exam") {
      el.resultsTimeStat.hidden = false;
      el.resultsTimeUsed.textContent = formatTime(entry.timeUsedSeconds);
    } else {
      el.resultsTimeStat.hidden = true;
    }

    el.resultsCategoryList.innerHTML = "";
    Object.keys(entry.categoryBreakdown).forEach(function (cat) {
      var stats = entry.categoryBreakdown[cat];
      var pct = Math.round((stats.correct / stats.total) * 100);

      var row = document.createElement("div");
      row.className = "category-row";

      var nameEl = document.createElement("span");
      nameEl.className = "category-name";
      nameEl.textContent = cat;

      var barWrap = document.createElement("div");
      barWrap.className = "category-bar-wrap";
      var bar = document.createElement("div");
      bar.className = "category-bar";
      bar.style.width = pct + "%";
      barWrap.appendChild(bar);

      var statText = document.createElement("span");
      statText.className = "category-stat-text";
      statText.textContent = stats.correct + "/" + stats.total + " (" + pct + "%)";

      row.appendChild(nameEl);
      row.appendChild(barWrap);
      row.appendChild(statText);
      el.resultsCategoryList.appendChild(row);
    });

    el.resultsRetryBtn.textContent = mode === "exam" ? "Take Another Exam" : "Practice Again";
    el.resultsRetryBtn.onclick = function () {
      if (mode === "exam") startExam();
      else startPractice();
    };

    if (mode === "exam" && data.reviewItems) {
      el.resultsReviewSection.hidden = false;
      el.resultsReviewList.innerHTML = "";
      data.reviewItems.forEach(function (item, idx) {
        el.resultsReviewList.appendChild(buildReviewItem(item, idx));
      });
    } else {
      el.resultsReviewSection.hidden = true;
    }
  }

  function buildReviewItem(item, idx) {
    var wrap = document.createElement("div");
    wrap.className = "review-item " + (item.isCorrect ? "correct" : "incorrect");

    var header = document.createElement("div");
    header.className = "review-item-header";
    header.textContent = "Q" + (idx + 1) + " — " + item.question.category + " — " + (item.isCorrect ? "Correct" : "Incorrect");
    wrap.appendChild(header);

    var qText = document.createElement("p");
    qText.className = "review-question-text";
    qText.textContent = item.question.question;
    wrap.appendChild(qText);

    if (item.question.code) {
      var pre = document.createElement("pre");
      pre.className = "code-block";
      var codeEl = document.createElement("code");
      codeEl.textContent = item.question.code;
      pre.appendChild(codeEl);
      wrap.appendChild(pre);
    }

    var optList = document.createElement("div");
    optList.className = "options-list review-options";
    item.question.options.forEach(function (opt, i) {
      var row = document.createElement("div");
      row.className = "review-option";
      if (item.correctSet.has(i)) row.classList.add("is-correct-answer");
      if (item.selectedSet.has(i) && !item.correctSet.has(i)) row.classList.add("is-wrong-selected");

      var marker = document.createElement("span");
      marker.className = "review-marker";
      if (item.selectedSet.has(i)) marker.textContent = item.correctSet.has(i) ? "✔" : "✘";
      else marker.textContent = item.correctSet.has(i) ? "✔" : "";

      var text = document.createElement("span");
      text.textContent = opt.text;

      row.appendChild(marker);
      row.appendChild(text);
      optList.appendChild(row);
    });
    wrap.appendChild(optList);

    var exp = document.createElement("p");
    exp.className = "review-explanation";
    exp.textContent = item.question.explanation;
    wrap.appendChild(exp);

    return wrap;
  }

  // ---------- Navigation ----------

  function goHome() {
    clearInterval(state.timerInterval);
    showScreen("home");
    renderHomeHistory();
  }

  // ---------- Init ----------

  function cacheElements() {
    el.historyBody = $("history-body");
    el.historyTable = $("history-table");
    el.historyEmpty = $("history-empty");

    el.examProgress = $("exam-progress");
    el.examTimer = $("exam-timer");
    el.examCategory = $("exam-category");
    el.examFlagBtn = $("exam-flag-btn");
    el.examQuestionText = $("exam-question-text");
    el.examCode = $("exam-code");
    el.examOptions = $("exam-options");
    el.examPalette = $("exam-palette");
    el.examSubmitBtn = $("exam-submit-btn");
    el.examExitBtn = $("exam-exit-btn");
    el.examPrevBtn = $("exam-prev-btn");
    el.examNextBtn = $("exam-next-btn");

    el.practiceProgress = $("practice-progress");
    el.practiceScore = $("practice-score");
    el.practiceExitBtn = $("practice-exit-btn");
    el.practiceCategory = $("practice-category");
    el.practiceQuestionText = $("practice-question-text");
    el.practiceCode = $("practice-code");
    el.practiceOptions = $("practice-options");
    el.practiceFeedback = $("practice-feedback");
    el.practiceVerdict = $("practice-verdict");
    el.practiceExplanation = $("practice-explanation");
    el.practiceCheckBtn = $("practice-check-btn");
    el.practiceNextBtn = $("practice-next-btn");

    el.resultsBanner = $("results-banner");
    el.resultsScorePercent = $("results-score-percent");
    el.resultsCorrectCount = $("results-correct-count");
    el.resultsTimeStat = $("results-time-stat");
    el.resultsTimeUsed = $("results-time-used");
    el.resultsCategoryList = $("results-category-list");
    el.resultsHomeBtn = $("results-home-btn");
    el.resultsRetryBtn = $("results-retry-btn");
    el.resultsReviewSection = $("results-review-section");
    el.resultsReviewList = $("results-review-list");

    el.confirmModal = $("confirm-modal");
    el.confirmModalMessage = $("confirm-modal-message");
    el.confirmModalOk = $("confirm-modal-ok");
    el.confirmModalCancel = $("confirm-modal-cancel");
  }

  function bindEvents() {
    $("start-exam-btn").addEventListener("click", startExam);
    $("start-practice-btn").addEventListener("click", startPractice);
    $("clear-history-btn").addEventListener("click", clearAllHistory);

    el.examFlagBtn.addEventListener("click", function () {
      var q = state.questions[state.currentIndex];
      state.flagged[q.id] = !state.flagged[q.id];
      renderExamQuestion();
    });
    el.examPrevBtn.addEventListener("click", function () {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        renderExamQuestion();
      }
    });
    el.examNextBtn.addEventListener("click", function () {
      if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex++;
        renderExamQuestion();
      }
    });
    el.examSubmitBtn.addEventListener("click", submitExamFlow);
    el.examExitBtn.addEventListener("click", exitExamFlow);

    el.practiceCheckBtn.addEventListener("click", checkPracticeAnswer);
    el.practiceNextBtn.addEventListener("click", nextPracticeQuestion);
    el.practiceExitBtn.addEventListener("click", exitPracticeFlow);

    el.resultsHomeBtn.addEventListener("click", goHome);
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    renderHomeHistory();
    showScreen("home");
  });
})();
