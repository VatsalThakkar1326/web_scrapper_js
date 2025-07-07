/**
 * Enhanced DOM Collector Script (Deep Scan Version)
 * Collects detailed information about all elements on a webpage, including deeply nested boxes
 */
(async () => {
  /* ═══════════════════════ CONFIG ═══════════════════════ */
  const MAX_ITER = window.DOM_COLLECTOR_CONFIG?.maxIterations || 1000;
  const WAIT_MS = window.DOM_COLLECTOR_CONFIG?.waitMs || 200;
  const DEBUG_MODE = window.DOM_COLLECTOR_CONFIG?.debug || false;
  
  const TRIGGER_SEL = [
    'a[href]:not([download])',
    'button',
    'summary',
    'input:not([type="hidden" i]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    '[aria-haspopup]',
    '[role~="button"],[role~="link"],[role~="menuitem"],[role~="checkbox"],[role~="switch"],[role~="radio"],[role~="combobox"]'
  ].join(',');

  /* ══════════════════════ STATE ════════════════════════ */
  const visitedControls = new WeakSet();
  const doneTriggers = new WeakSet();
  const queue = [];
  const results = [];
  const errors = [];
  const startTime = performance.now();

  /* ════════════════  UTILITY FUNCTIONS  ═════════════════ */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  const debugLog = (message, data = null) => {
    if (DEBUG_MODE) {
      console.log(`[DOM-Collector] ${message}`, data || '');
    }
  };

  const addError = (error, element = null) => {
    errors.push({
      timestamp: new Date().toISOString(),
      error: error.toString(),
      element: element ? getElementPath(element) : null,
      stack: error.stack
    });
    debugLog(`Error: ${error.message}`, element);
  };

  /* ════════════════  ELEMENT ANALYSIS  ═════════════════ */
  
  function getElementPath(element) {
    if (!element || element === document.body) return 'body';
    
    const path = [];
    let current = element;
    
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += '#' + CSS.escape(current.id);
        path.unshift(selector);
        break; // ID is unique, stop here
      } else if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(Boolean);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }
      
      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(sibling => sibling.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ') || 'unknown';
  }

  function getLabel(el) {
    try {
      // Direct label association
      if (el.labels && el.labels.length > 0) {
        return el.labels[0].innerText.trim();
      }
      
      // ARIA label
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      
      // Label by ID
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.innerText.trim();
      }
      
      // Placeholder as fallback
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return `[Placeholder: ${placeholder}]`;
      
      // Parent label (common pattern)
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (parent.tagName.toLowerCase() === 'label') {
          return parent.innerText.trim();
        }
        parent = parent.parentElement;
      }
      
      return null;
    } catch (error) {
      addError(error, el);
      return null;
    }
  }

  function getDetailedElementInfo(el) {
    try {
      const rect = el.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(el);
      
      return {
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        },
        visibility: {
          visible: rect.width > 0 && rect.height > 0 && 
                   computedStyle.visibility !== 'hidden' && 
                   computedStyle.display !== 'none',
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: parseFloat(computedStyle.opacity),
          zIndex: computedStyle.zIndex
        },
        styling: {
          color: computedStyle.color,
          backgroundColor: computedStyle.backgroundColor,
          fontSize: computedStyle.fontSize,
          fontFamily: computedStyle.fontFamily,
          border: computedStyle.border,
          borderRadius: computedStyle.borderRadius,
          padding: computedStyle.padding,
          margin: computedStyle.margin
        },
        accessibility: {
          tabIndex: el.tabIndex,
          ariaLabel: el.getAttribute('aria-label'),
          ariaRole: el.getAttribute('role'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaHidden: el.getAttribute('aria-hidden'),
          ariaDisabled: el.getAttribute('aria-disabled')
        }
      };
    } catch (error) {
      addError(error, el);
      return {
        position: { x: 0, y: 0, width: 0, height: 0 },
        visibility: { visible: false },
        styling: {},
        accessibility: {}
      };
    }
  }

  function getFormContext(el) {
    try {
      const form = el.closest('form');
      if (!form) return null;
      
      return {
        action: form.action || null,
        method: form.method || 'get',
        enctype: form.enctype || null,
        id: form.id || null,
        name: form.name || null,
        autocomplete: form.autocomplete || null
      };
    } catch (error) {
      addError(error, el);
      return null;
    }
  }

  function serialise(el) {
    if (visitedControls.has(el)) return;
    visitedControls.add(el);

    try {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const detailedInfo = getDetailedElementInfo(el);
      const formContext = getFormContext(el);
      
      const obj = {
        // Basic identification
        tag,
        type: type || null,
        id: el.id || null,
        name: el.name || null,
        classes: el.className || null,
        
        // Content and labels
        label: getLabel(el),
        innerText: el.innerText?.trim() || null,
        value: el.value || null,
        placeholder: el.placeholder || null,
        title: el.title || null,
        
        // States and properties
        required: el.required || el.hasAttribute('required') || false,
        disabled: el.disabled || false,
        readonly: el.readOnly || false,
        checked: (type === 'checkbox' || type === 'radio') ? el.checked : null,
        selected: tag === 'option' ? el.selected : null,
        
        // Navigation and interaction
        href: tag === 'a' ? el.href : null,
        target: tag === 'a' ? (el.target || null) : null,
        
        // Structure and location
        path: getElementPath(el),
        formContext,
        
        // Complete attributes
        attributes: Object.fromEntries(
          [...el.attributes].map(a => [a.name, a.value])
        ),
        
        // Detailed analysis
        details: detailedInfo,
        
        // Metadata
        timestamp: new Date().toISOString()
      };

      // Element-specific enhancements
      if (tag === 'select') {
        obj.options = [...el.options].map((opt, index) => ({
          index,
          value: opt.value,
          text: opt.text,
          selected: opt.selected,
          disabled: opt.disabled
        }));
        obj.multiple = el.multiple;
        obj.size = el.size;
      }

      if (tag === 'input') {
        obj.min = el.min || null;
        obj.max = el.max || null;
        obj.step = el.step || null;
        obj.pattern = el.pattern || null;
        obj.maxLength = el.maxLength > 0 ? el.maxLength : null;
        obj.minLength = el.minLength > 0 ? el.minLength : null;
        obj.autocomplete = el.autocomplete || null;
      }

      if (tag === 'textarea') {
        obj.rows = el.rows;
        obj.cols = el.cols;
        obj.maxLength = el.maxLength > 0 ? el.maxLength : null;
        obj.wrap = el.wrap || null;
      }

      results.push(obj);
      debugLog(`Serialized ${tag} element`, obj.path);
      
    } catch (error) {
      addError(error, el);
    }
  }

  // Deeply scan all descendants (including shadow roots)
  function deepScan(root) {
    try {
      if (!root || !root.querySelectorAll) return;
      // Serialize this element if it's an Element node
      if (root.nodeType === 1) serialise(root);
      // Recurse into shadow root if present
      if (root.shadowRoot) deepScan(root.shadowRoot);
      // Recurse into children
      root.childNodes.forEach(child => {
        if (child.nodeType === 1) deepScan(child);
      });
    } catch (error) {
      addError(error, root);
    }
  }

  async function act(el) {
    if (!el.isConnected) return;
    
    try {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      
      debugLog(`Acting on ${tag} element`, getElementPath(el));

      if (tag === 'summary' && el.parentElement?.tagName.toLowerCase() === 'details') {
        el.parentElement.open = true;
      }
      else if (tag === 'details') {
        el.open = true;
      }
      else if (tag === 'select') {
        // Expand dropdown to reveal options
        el.size = Math.max(el.options.length, 5);
        el.focus();
      }
      else if (tag === 'a') {
        // Only click same-origin links to avoid navigation
        try {
          const url = new URL(el.href, location.href);
          if (url.origin === location.origin && url.pathname === location.pathname) {
            el.click();
          }
        } catch (urlError) {
          debugLog('Invalid URL for link', el.href);
        }
      }
      else if (type === 'checkbox' || type === 'radio') {
        const originalState = el.checked;
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Restore original state to avoid side effects
        setTimeout(() => {
          if (el.isConnected) el.checked = originalState;
        }, WAIT_MS);
      }
      else if (tag === 'input' && (!type || type === 'text' || type === 'email' || type === 'search')) {
        el.focus();
        const originalValue = el.value;
        el.value = 'test-value';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Restore original value
        setTimeout(() => {
          if (el.isConnected) el.value = originalValue;
        }, WAIT_MS);
      }
      else if (tag === 'button' && el.type !== 'submit') {
        // Safe to click non-submit buttons
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      else {
        // Generic interaction for other elements
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new Event('focus', { bubbles: true }));
      }
      
    } catch (error) {
      addError(error, el);
    }
    
    await sleep(WAIT_MS);
  }

  /* ═══════════════ INITIALIZATION ═══════════════ */
  debugLog('Starting DOM collection');
  
  // Initial page preparation
  try {
    document.querySelectorAll('details:not([open])').forEach(d => {
      d.open = true;
      debugLog('Opened details element');
    });
    
    document.querySelectorAll('[hidden]').forEach(el => {
      el.removeAttribute('hidden');
      debugLog('Revealed hidden element', el.tagName);
    });
  } catch (error) {
    addError(error);
  }

  // Deep scan the document for all elements
  deepScan(document.body);

  // Queue triggers for interaction
  try {
    document.querySelectorAll(TRIGGER_SEL).forEach(el => {
      if (!doneTriggers.has(el) && el.isConnected) {
        queue.push(el);
      }
    });
  } catch (error) {
    addError(error);
  }

  debugLog(`Initial scan complete. Found ${results.length} elements, ${queue.length} triggers`);

  /* ══════════════════ MUTATION OBSERVER ════════════════ */
  const observer = new MutationObserver(mutations => {
    try {
      mutations.forEach(mutation => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              deepScan(node);
              if (node.shadowRoot) {
                deepScan(node.shadowRoot);
              }
            }
          });
        }
      });
    } catch (error) {
      addError(error);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false // Focus on structural changes
  });

  /* ═════════════════════ INTERACTION LOOP ═════════════════════ */
  let iterations = 0;
  const initialQueueSize = queue.length;
  
  while (queue.length && iterations < MAX_ITER) {
    const trig = queue.shift();
    
    if (!trig.isConnected || doneTriggers.has(trig)) {
      iterations++;
      continue;
    }
    
    doneTriggers.add(trig);
    await act(trig);
    iterations++;
    
    if (iterations % 50 === 0) {
      debugLog(`Progress: ${iterations} interactions completed, ${queue.length} remaining`);
    }
  }

  observer.disconnect();
  
  /* ═══════════════════ FINAL RESULTS ═════════════════════ */
  const endTime = performance.now();
  const executionTime = Math.round(endTime - startTime);
  
  const finalResults = {
    metadata: {
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
      url: window.location.href,
      title: document.title,
      totalElements: results.length,
      totalInteractions: iterations,
      initialTriggers: initialQueueSize,
      errors: errors.length,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      config: {
        maxIterations: MAX_ITER,
        waitMs: WAIT_MS,
        debugMode: DEBUG_MODE
      }
    },
    elements: results,
    errors: errors,
    statistics: {
      byTag: {},
      byType: {},
      interactiveElements: 0,
      formElements: 0,
      requiredElements: 0,
      disabledElements: 0,
      visibleElements: 0
    }
  };

  // Generate statistics
  const formTags = new Set(['input', 'select', 'textarea', 'button']);
  const interactiveTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);

  results.forEach(element => {
    const tag = element.tag;
    const type = element.type || 'none';

    // Count by tag
    finalResults.statistics.byTag[tag] = (finalResults.statistics.byTag[tag] || 0) + 1;
    
    // Count by type
    finalResults.statistics.byType[type] = (finalResults.statistics.byType[type] || 0) + 1;
    
    // Count categories
    if (formTags.has(tag)) finalResults.statistics.formElements++;
    if (interactiveTags.has(tag)) finalResults.statistics.interactiveElements++;
    if (element.required) finalResults.statistics.requiredElements++;
    if (element.disabled) finalResults.statistics.disabledElements++;
    if (element.details?.visibility?.visible) finalResults.statistics.visibleElements++;
  });

  console.log(`✅ DOM Collection Complete!`);
  console.log(`📊 Collected ${results.length} elements in ${executionTime}ms`);
  console.log(`🔄 Performed ${iterations} interactions`);
  console.log(`⚠️  ${errors.length} errors encountered`);

  // Download the collected results as dom.json
  (function downloadJSON(data, filename = "dom.json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  })(finalResults);

  // Optionally, log the results to the console
  console.log(finalResults);
})();
