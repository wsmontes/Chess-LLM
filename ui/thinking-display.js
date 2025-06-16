class ThinkingDisplay {
    constructor() {
        this.thinkingIndicator = document.getElementById('thinking-indicator');
        this.thinkingContent = document.getElementById('thinking-content');
        this.thinkingToggle = document.getElementById('thinking-toggle');
        this.isThinkingVisible = true;
        this.currentThinkingSteps = [];
    }

    updateThinkingDisplay(steps) {
        this.currentThinkingSteps = steps;
        
        if (!this.isThinkingVisible) return;

        // Find the current move's thinking section
        const headers = this.thinkingContent.querySelectorAll('.thinking-move-header');
        const lastHeader = headers[headers.length - 1];
        
        // Remove all thinking steps after the last header
        if (lastHeader) {
            let nextElement = lastHeader.nextElementSibling;
            while (nextElement) {
                const toRemove = nextElement;
                nextElement = nextElement.nextElementSibling;
                if (!toRemove.classList.contains('thinking-move-header') && 
                    !toRemove.classList.contains('thinking-stream-indicator') &&
                    !toRemove.classList.contains('thinking-retry-header')) {
                    toRemove.remove();
                }
            }
        }

        // Remove stream indicator if it exists
        const indicator = this.thinkingContent.querySelector('.thinking-stream-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Add current thinking steps
        steps.forEach((step, index) => {
            const stepElement = this.createThinkingStep(step, index);
            this.thinkingContent.appendChild(stepElement);
        });

        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    createThinkingStep(step, index) {
        const stepElement = document.createElement('div');
        stepElement.className = `thinking-step ${step.type}`;
        
        const labels = {
            'analysis': 'Position Analysis',
            'evaluation': 'Move Evaluation',
            'decision': 'Decision Making',
            'final': 'Final Move',
            'validation-error': 'Move Validation Error',
            'retry-success': 'Retry Success',
            'confirmation-request': 'Move Clarification'
        };

        stepElement.innerHTML = `
            <div class="thinking-step-label">${labels[step.type] || 'Thinking'}</div>
            <div class="thinking-step-content">${this.escapeHtml(step.content)}</div>
        `;

        return stepElement;
    }

    addMoveThinkingHeader(engine) {
        if (!this.isThinkingVisible) return;
        
        const hasExistingContent = this.thinkingContent.children.length > 0 && 
            !this.thinkingContent.querySelector('.thinking-placeholder');
        
        const moveNumber = Math.ceil((engine.moveHistory.length + 1) / 2);
        const headerElement = document.createElement('div');
        headerElement.className = 'thinking-move-header';
        
        if (hasExistingContent) {
            headerElement.innerHTML = `
                <div class="thinking-move-separator"></div>
                <div class="thinking-move-title">
                    <i class="fas fa-chess"></i>
                    Move ${moveNumber} - Black's Turn
                </div>
            `;
        } else {
            headerElement.innerHTML = `
                <div class="thinking-move-title">
                    <i class="fas fa-chess"></i>
                    Move ${moveNumber} - Black's Turn
                </div>
            `;
            
            const placeholder = this.thinkingContent.querySelector('.thinking-placeholder');
            if (placeholder) {
                placeholder.remove();
            }
        }
        
        this.thinkingContent.appendChild(headerElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    showThinking(show) {
        this.thinkingIndicator.classList.toggle('active', show);
    }

    showThinkingStreamIndicator(show) {
        const existing = this.thinkingContent.querySelector('.thinking-stream-indicator');
        
        if (show && !existing) {
            const indicator = document.createElement('div');
            indicator.className = 'thinking-stream-indicator';
            indicator.innerHTML = `
                <i class="fas fa-brain"></i>
                <span>LLM is analyzing the position...</span>
            `;
            this.thinkingContent.appendChild(indicator);
        } else if (!show && existing) {
            existing.remove();
        }
    }

    clearThinkingDisplay() {
        this.currentThinkingSteps = [];
        this.thinkingContent.innerHTML = '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Add specialized thinking display methods
    addValidationErrorToThinking(moveNotation, reason) {
        if (!this.isThinkingVisible) return;
        
        const errorStep = {
            type: 'validation-error',
            content: `❌ Invalid move attempted: "${moveNotation}"\nReason: ${reason}`
        };
        
        const stepElement = this.createThinkingStep(errorStep, 0);
        stepElement.style.borderLeftColor = '#ff9800';
        stepElement.style.background = 'rgba(255, 152, 0, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addFinalMoveToThinking(move) {
        const finalStep = {
            type: 'final',
            content: `Selected move: ${move}`
        };
        
        this.currentThinkingSteps.push(finalStep);
        
        if (this.isThinkingVisible) {
            const stepElement = this.createThinkingStep(finalStep, this.currentThinkingSteps.length - 1);
            this.thinkingContent.appendChild(stepElement);
            this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
        }
    }

    addRetryThinkingHeader(attemptNumber, previousAttempt) {
        if (!this.isThinkingVisible) return;
        
        const headerElement = document.createElement('div');
        headerElement.className = 'thinking-retry-header';
        headerElement.innerHTML = `
            <div class="thinking-retry-separator"></div>
            <div class="thinking-retry-title">
                <i class="fas fa-redo"></i>
                Retry Attempt ${attemptNumber + 1} - Correcting "${previousAttempt.move}"
            </div>
        `;
        
        this.thinkingContent.appendChild(headerElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addSuccessAfterRetryToThinking(totalAttempts) {
        if (!this.isThinkingVisible) return;
        
        const successStep = {
            type: 'retry-success',
            content: `✅ Valid move found after ${totalAttempts} attempts`
        };
        
        const stepElement = this.createThinkingStep(successStep, 0);
        stepElement.style.borderLeftColor = '#4caf50';
        stepElement.style.background = 'rgba(76, 175, 80, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addErrorToThinking(error) {
        if (!this.isThinkingVisible) return;
        
        const errorStep = {
            type: 'error',
            content: `Error: ${error}`
        };
        
        const stepElement = this.createThinkingStep(errorStep, 0);
        stepElement.style.borderLeftColor = '#f44336';
        stepElement.style.background = 'rgba(244, 67, 54, 0.05)';
        this.thinkingContent.appendChild(stepElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }
}
