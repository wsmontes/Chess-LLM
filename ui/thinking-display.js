class ThinkingDisplay {
    constructor() {
        this.thinkingIndicator = document.getElementById('thinking-indicator');
        this.thinkingContent = document.getElementById('thinking-content');
        this.thinkingToggle = document.getElementById('thinking-toggle');
        this.isThinkingVisible = true;
        this.currentThinkingSteps = [];
        this.currentIteration = 0;
        this.totalIterations = 0;
    }

    updateThinkingDisplay(steps) {
        this.currentThinkingSteps = steps;
        
        if (!this.isThinkingVisible) return;

        // Add steps without removing previous content (accumulative display)
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
            'confirmation-request': 'Move Clarification',
            'iteration-start': 'Deep Analysis Start',
            'tactical-analysis': 'Tactical Analysis',
            'strategic-analysis': 'Strategic Analysis',
            'candidate-moves': 'Candidate Move Generation',
            'move-comparison': 'Move Comparison',
            'position-assessment': 'Position Assessment',
            'iteration-conclusion': 'Iteration Summary',
            'deep-evaluation': 'Deep Evaluation',
            'refinement': 'Move Refinement',
            'information-request': '🔍 Information Request',
            'information-response': '📊 System Data'
        };

        // Add iteration indicator for deep thinking steps
        let iterationIndicator = '';
        if (step.iteration !== undefined && this.totalIterations > 1) {
            iterationIndicator = `<span class="iteration-indicator">Iteration ${step.iteration}/${this.totalIterations}</span>`;
        }

        // Format content based on step type
        let formattedContent = step.content;
        if (step.type === 'information-response') {
            // Format system information responses better
            formattedContent = this.formatSystemResponse(step.content);
        } else if (step.type === 'deep-evaluation') {
            // Format deep evaluation with better structure
            formattedContent = this.formatDeepEvaluation(step.content);
        }

        stepElement.innerHTML = `
            <div class="thinking-step-header">
                <div class="thinking-step-label">${labels[step.type] || 'Thinking'}</div>
                ${iterationIndicator}
            </div>
            <div class="thinking-step-content">${this.escapeHtml(formattedContent)}</div>
        `;

        return stepElement;
    }

    formatSystemResponse(content) {
        // Format system responses with better structure
        const sections = content.split('\n\n');
        return sections.map(section => {
            const lines = section.split('\n');
            if (lines[0].includes(':')) {
                const [header, ...body] = lines;
                return `<strong>${header}</strong>\n${body.join('\n')}`;
            }
            return section;
        }).join('\n\n');
    }

    formatDeepEvaluation(content) {
        // Format deep evaluation content with emphasis on key points
        return content.replace(/After (\d+) iterations/, '<strong>After $1 iterations</strong>')
                      .replace(/Final synthesis/, '<strong>Final synthesis</strong>')
                      .replace(/Selected move: ([a-zA-Z0-9]+)/, '<strong>Selected move: $1</strong>');
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

    addIterationHeader(iterationNumber, totalIterations, phase) {
        if (!this.isThinkingVisible) return;
        
        this.currentIteration = iterationNumber;
        this.totalIterations = totalIterations;
        
        const headerElement = document.createElement('div');
        headerElement.className = 'thinking-iteration-header';
        headerElement.innerHTML = `
            <div class="thinking-iteration-separator"></div>
            <div class="thinking-iteration-title">
                <i class="fas fa-layer-group"></i>
                <span>Deep Analysis - Iteration ${iterationNumber}/${totalIterations}</span>
                <span class="iteration-phase">${this.getPhaseLabel(phase)}</span>
            </div>
            <div class="thinking-iteration-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(iterationNumber / totalIterations) * 100}%"></div>
                </div>
            </div>
        `;
        
        this.thinkingContent.appendChild(headerElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    getPhaseLabel(phase) {
        const phaseLabels = {
            'initial': 'Initial Assessment',
            'tactical': 'Tactical Deep Dive',
            'strategic': 'Strategic Planning',
            'refinement': 'Move Refinement',
            'verification': 'Final Verification'
        };
        return phaseLabels[phase] || phase;
    }

    addIterationSummary(iterationNumber, keyFindings, candidateMoves) {
        if (!this.isThinkingVisible) return;
        
        const summaryElement = document.createElement('div');
        summaryElement.className = 'thinking-iteration-summary';
        
        // Clean up key findings text
        const cleanFindings = keyFindings.replace(/^\s*[-•]\s*/gm, '• ');
        
        summaryElement.innerHTML = `
            <div class="summary-header">
                <i class="fas fa-clipboard-check"></i>
                <span>Iteration ${iterationNumber} Summary</span>
            </div>
            <div class="summary-content">
                <div class="key-findings">
                    <strong>Key Findings:</strong>
                    <div class="findings-list">${this.escapeHtml(cleanFindings)}</div>
                </div>
                <div class="candidate-moves">
                    <strong>Top Candidates:</strong>
                    <div class="moves-list">${candidateMoves.slice(0, 3).join(', ')}</div>
                </div>
            </div>
        `;
        
        this.thinkingContent.appendChild(summaryElement);
        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
    }

    addDeepThinkingIndicator(show, phase = '') {
        const existing = this.thinkingContent.querySelector('.deep-thinking-indicator');
        
        if (show && !existing) {
            const indicator = document.createElement('div');
            indicator.className = 'deep-thinking-indicator';
            indicator.innerHTML = `
                <div class="deep-thinking-animation">
                    <i class="fas fa-brain"></i>
                    <div class="thinking-waves">
                        <div class="wave wave1"></div>
                        <div class="wave wave2"></div>
                        <div class="wave wave3"></div>
                    </div>
                </div>
                <div class="deep-thinking-text">
                    <span class="main-text">Engaging Deep Analysis...</span>
                    <span class="phase-text">${phase}</span>
                </div>
            `;
            this.thinkingContent.appendChild(indicator);
        } else if (!show && existing) {
            existing.remove();
        } else if (show && existing && phase) {
            const phaseText = existing.querySelector('.phase-text');
            if (phaseText) {
                phaseText.textContent = phase;
            }
        }
    }

    updateThinkingPhase(phase, progress) {
        const indicator = this.thinkingContent.querySelector('.deep-thinking-indicator');
        if (indicator) {
            const phaseText = indicator.querySelector('.phase-text');
            const mainText = indicator.querySelector('.main-text');
            
            if (phaseText) {
                phaseText.textContent = this.getPhaseLabel(phase);
            }
            
            if (mainText && progress !== undefined) {
                mainText.textContent = `Deep Analysis - ${Math.round(progress)}% Complete`;
            }
        }
    }
}
