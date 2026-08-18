(() => {
  "use strict";

  function create({ productionContent, productionModel, productionPanel, clearProductionOutput, fact, productTruthSnapshot, setProductionStatus, onCompiled }) {
    function renderListCard(container, titleText, items) {
      const card = document.createElement("article");
      card.className = "compare-card";
      const title = document.createElement("h3");
      title.textContent = titleText;
      const list = document.createElement("ul");
      list.className = "muted small";
      for (const text of items) {
        const item = document.createElement("li");
        item.textContent = text;
        list.append(item);
      }
      card.append(title, list);
      container.append(card);
    }

    function promptPreview(prompt) {
      const singleLine = String(prompt || "").replace(/\s+/g, " ").trim();
      return singleLine.length > 360 ? `${singleLine.slice(0, 360)}…` : singleLine;
    }

    function render(result) {
      const guide = result.guide || {};
      clearProductionOutput();
      productionModel.textContent = result.model || "NO GEMINI";
      productionPanel.dataset.geminiRequests = String(result.diagnostics?.gemini_requests ?? 0);
      productionPanel.dataset.persistenceWrites = String(result.diagnostics?.persistence_writes ?? 0);
      productionPanel.dataset.backgroundBatchRequests = String(result.diagnostics?.background_batch_requests ?? 0);
      const heading = document.createElement("div");
      heading.className = "detail-heading-block";
      const title = document.createElement("h3");
      title.textContent = "내 상품용 제작 가이드";
      const summary = document.createElement("p");
      summary.className = "detail-summary";
      summary.textContent = guide.direction_summary || "제작 방향을 생성하지 못했습니다.";
      heading.append(title, summary);
      const facts = document.createElement("div");
      facts.className = "detail-facts";
      fact(facts, "Product Truth", result.product_truth_authority || "—");
      fact(facts, "Reference analysis", result.reference_analysis_authority || "—");
      fact(facts, "Metrics", result.metrics_authority || "—");
      fact(facts, "Interpretation", guide.interpretation_ready ? "READY" : guide.interpretation_required ? "REQUIRED" : "NOT REQUIRED");
      fact(facts, "Persistence", result.persistence_authority || "—");
      fact(facts, "Gemini requests", String(result.diagnostics?.gemini_requests ?? 0));
      productionContent.append(heading, facts);
      const stepsTitle = document.createElement("h3");
      stepsTitle.textContent = "추천 제작 흐름";
      const steps = document.createElement("div");
      steps.className = "compare-grid";
      for (const step of guide.production_steps || []) {
        const card = document.createElement("article");
        card.className = "compare-card";
        const name = document.createElement("h3");
        name.textContent = step.title || "제작 단계";
        const detail = document.createElement("p");
        detail.className = "compare-summary";
        detail.textContent = step.detail || "";
        card.append(name, detail);
        steps.append(card);
      }
      productionContent.append(stepsTitle, steps);
      const assetGrid = document.createElement("div");
      assetGrid.className = "compare-grid";
      for (const group of guide.asset_groups || []) renderListCard(assetGrid, `${group.icon || ""} ${group.title || "준비 소재"}`.trim(), Array.isArray(group.items) ? group.items : []);
      if (assetGrid.childElementCount > 0) {
        const assetTitle = document.createElement("h3");
        assetTitle.textContent = "준비할 소재";
        productionContent.append(assetTitle, assetGrid);
      }
      if (Array.isArray(guide.critical_warnings) && guide.critical_warnings.length > 0) {
        const warningGrid = document.createElement("div");
        warningGrid.className = "compare-grid";
        renderListCard(warningGrid, "제작 전 확인", guide.critical_warnings);
        productionContent.append(warningGrid);
      }
      const excludedCount = Array.isArray(guide.excluded_reference_mechanisms) ? guide.excluded_reference_mechanisms.length : 0;
      if (excludedCount > 0) {
        const safeNotice = document.createElement("p");
        safeNotice.className = "library-state";
        safeNotice.textContent = `참고 메커니즘 ${excludedCount}개는 내 상품 정보와 연결이 불확실하거나 적용할 수 없어 안전하게 제외했습니다.`;
        productionContent.append(safeNotice);
      }
      const promptSurface = document.createElement("section");
      promptSurface.dataset.productionPromptSurface = "ready";
      promptSurface.style.marginTop = "20px";
      const promptTitle = document.createElement("h3");
      promptTitle.textContent = "AI에게 맡기기";
      const promptExplanation = document.createElement("p");
      promptExplanation.className = "muted small";
      promptExplanation.textContent = "이 프롬프트는 참고영상의 제작 구조, 서버가 다시 계산한 분석 지표, 사용자가 입력한 Product Truth와 과장 방지 규칙을 조합합니다. 참고영상의 상품 주장이나 스펙을 내 상품 사실로 복사하지 않습니다.";
      const promptGrid = document.createElement("div");
      promptGrid.className = "compare-grid";
      const labels = { script: "대본 만들기", shooting: "촬영 계획", assets: "소재 목록", editing: "편집 지시" };
      for (const [kind, label] of Object.entries(labels)) {
        const prompt = guide.prompts?.[kind];
        if (!prompt) continue;
        const card = document.createElement("article");
        card.className = "compare-card";
        const name = document.createElement("h3");
        name.textContent = label;
        const previewLabel = document.createElement("span");
        previewLabel.className = "eyebrow";
        previewLabel.textContent = "프롬프트 미리보기";
        const preview = document.createElement("p");
        preview.className = "muted small";
        preview.style.minHeight = "58px";
        preview.textContent = promptPreview(prompt);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary compact";
        button.dataset.productionPromptKind = kind;
        button.textContent = "프롬프트 복사";
        button.addEventListener("click", async () => {
          await navigator.clipboard.writeText(prompt);
          button.textContent = "복사됨";
          window.setTimeout(() => { button.textContent = "프롬프트 복사"; }, 1200);
        });
        card.append(name, previewLabel, preview, button);
        promptGrid.append(card);
      }
      promptSurface.append(promptTitle, promptExplanation, promptGrid);
      const rawPrompt = typeof guide.raw_prompt === "string" && guide.raw_prompt.trim() ? guide.raw_prompt : Object.values(guide.prompts || {}).filter((value) => typeof value === "string").join("\n\n---\n\n");
      if (rawPrompt) {
        const rawDetails = document.createElement("details");
        rawDetails.style.marginTop = "16px";
        const rawSummary = document.createElement("summary");
        rawSummary.style.cursor = "pointer";
        rawSummary.style.fontWeight = "800";
        rawSummary.textContent = "전체 제작 프롬프트 보기";
        const toolbar = document.createElement("div");
        toolbar.style.display = "flex";
        toolbar.style.justifyContent = "flex-end";
        toolbar.style.margin = "12px 0";
        const copyAll = document.createElement("button");
        copyAll.type = "button";
        copyAll.className = "secondary compact";
        copyAll.dataset.productionPromptAll = "true";
        copyAll.setAttribute("data-production-prompt-all", "true");
        copyAll.textContent = "전체 복사";
        copyAll.addEventListener("click", async () => {
          await navigator.clipboard.writeText(rawPrompt);
          copyAll.textContent = "복사됨";
          window.setTimeout(() => { copyAll.textContent = "전체 복사"; }, 1200);
        });
        const rawBody = document.createElement("pre");
        rawBody.style.whiteSpace = "pre-wrap";
        rawBody.style.overflowWrap = "anywhere";
        rawBody.style.maxHeight = "420px";
        rawBody.style.overflow = "auto";
        rawBody.style.padding = "14px";
        rawBody.style.border = "1px solid #29354b";
        rawBody.style.borderRadius = "12px";
        rawBody.style.background = "#0d1320";
        rawBody.style.color = "#d7deeb";
        rawBody.textContent = rawPrompt;
        toolbar.append(copyAll);
        rawDetails.append(rawSummary, toolbar, rawBody);
        promptSurface.append(rawDetails);
      }
      productionContent.append(promptSurface);
      productionPanel.dataset.guidanceStale = "false";
      const readyStatus = excludedCount > 0 ? "READY WITH WARNINGS" : "READY";
      onCompiled(productTruthSnapshot(), readyStatus);
      setProductionStatus(readyStatus, "ok");
    }

    return Object.freeze({ render });
  }

  window.MASTERV_PRODUCTION_GUIDANCE_RENDERER = Object.freeze({ create });
})();