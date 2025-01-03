import { getTranslationValue } from './translations.js';

export class LearningDialog extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._hass = null;
        this._device_id = null;
        this._has_people = false;
        this._isLearning = false;
        this._countdown = 45;
        this._countdownTimer = null;
        this._dotPosition = 0;
        this._dotAnimationFrame = null;

    }

    set hasPeople(value) {
        this._has_people = value;
        this.render();
    }

    set hass(hass) {
        this._hass = hass;
        this.render();
    }

    set device_id(value) {
        this._device_id = value;
    }

    connectedCallback() {
        this.render();
        
    }

    disconnectedCallback() {
        this.cleanup();
    }

    async cleanup() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            // 无人学习结束时发送结束命令
            // if (!this._has_people) {
            //     try {
            //         await this._hass.callWS({
            //             type: 'airibes/learning_data',
            //             learn_type: 1,      // 无人学习
            //             action: false,       // 结束
            //             device_id: this._device_id
            //         });
            //     } catch (error) {
            //         console.error("发送无人学习结束命令失败:", error);
            //     }
            // }
        }
        if (this._dotAnimationFrame) {
            cancelAnimationFrame(this._dotAnimationFrame);
        }
    }

    async startLearning() {
        this._isLearning = true;
        try {
            if (!this._has_people) {
                // 发送开始无人学习命令
                await this._hass.callWS({
                    type: 'airibes/learning_data',
                    learn_type: 1,          // 无人学习
                    action: true,           // 开始
                    device_id: this._device_id
                });
                this.startCountdown();
            } else {
                // 发送开始有人学习命令
                await this._hass.callWS({
                    type: 'airibes/learning_data',
                    learn_type: 2,          // 单人学习
                    action: true,           // 开始
                    device_id: this._device_id
                });
                this.startDotAnimation();
            }
            this.render();
        } catch (error) {
            console.error("发送学习命令失败:", error);
            alert(getTranslationValue('learning_end_failed', this._hass?.language || 'en'));
        }
    }

    startCountdown() {
        this._countdown = 45;
        this._countdownTimer = setInterval(() => {
            this._countdown--;
            if (this._countdown <= 0) {
                this.cleanup();
                this.remove();
            }
            this.updateCountdown();
        }, 1000);
    }

    updateCountdown() {
        const countdownElement = this.shadowRoot.querySelector('.countdown');
        if (countdownElement) {
            countdownElement.textContent = `${this._countdown}S`;
        }
    }

    startDotAnimation() {
        requestAnimationFrame(() => {
            const canvas = this.shadowRoot.querySelector('.path-canvas');
            if (!canvas) return;

            canvas.width = 200;
            canvas.height = 200;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const padding = 20;

            const animateDot = () => {
                ctx.clearRect(0, 0, width, height);
                
                ctx.beginPath();
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 2;
                ctx.strokeRect(padding, padding, width - padding * 2, height - padding * 2);

                const pathLength = (width - padding * 2) * 2 + (height - padding * 2) * 2;
                const position = (this._dotPosition % pathLength);
                let x, y;

                if (position < width - padding * 2) {
                    x = padding + position;
                    y = padding;
                } else if (position < (width - padding * 2) + (height - padding * 2)) {
                    x = width - padding;
                    y = padding + (position - (width - padding * 2));
                } else if (position < (width - padding * 2) * 2 + (height - padding * 2)) {
                    x = width - padding - (position - ((width - padding * 2) + (height - padding * 2)));
                    y = height - padding;
                } else {
                    x = padding;
                    y = height - padding - (position - ((width - padding * 2) * 2 + (height - padding * 2)));
                }

                ctx.beginPath();
                ctx.fillStyle = '#03a9f4';
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();

                // 使动画圆点跑动慢一些
                this._dotPosition += 0.5; // 每次增加的位置减少，导致动画速度变慢
                this._dotAnimationFrame = requestAnimationFrame(animateDot);
            };

            animateDot();
        });
    }

    render() {
        const style = `
            :host {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }

            .dialog-content {
                background: var(--card-background-color, #fff);
                padding: 24px;
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
                text-align: center;
                animation: fadeIn 0.3s ease-out;
                min-width: 300px;
            }

            .title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 16px;
                color: var(--primary-text-color);
            }

            .message {
                font-size: 14px;
                color: var(--secondary-text-color);
                margin-bottom: 20px;
            }

            .loading-spinner {
                display: ${this._isLearning && !this._has_people ? 'inline-block' : 'none'};
                width: 40px;
                height: 40px;
                margin-bottom: 16px;
                border: 4px solid var(--primary-color);
                border-radius: 50%;
                border-top-color: transparent;
                animation: spin 1s linear infinite;
            }

            .path-canvas {
                display: ${this._isLearning && this._has_people ? 'block' : 'none'};
                width: 200px;
                height: 200px;
                margin: 0 auto 16px;
                border: 1px solid #eee;
                background: white;
            }

            .countdown {
                font-size: 24px;
                color: var(--primary-color);
                margin: 16px 0;
            }

            .buttons {
                display: flex;
                justify-content: center;
                gap: 16px;
            }

            button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .cancel-btn {
                background: var(--secondary-background-color);
                color: var(--primary-text-color);
            }

            .start-btn, .end-btn {
                background: var(--primary-color);
                color: white;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;

        this.shadowRoot.innerHTML = `
            <style>${style}</style>
            <div class="dialog-content">
                <div class="title">
                    ${this._has_people ? getTranslationValue('learning_single_person', this._hass?.language || 'en') : getTranslationValue('learning_no_people', this._hass?.language || 'en')}
                </div>
                <div class="message">
                    ${this._has_people ? 
                        getTranslationValue('learning_single_person_message', this._hass?.language || 'en') : 
                        getTranslationValue('learning_no_people_message', this._hass?.language || 'en')}
                </div>
                <div class="loading-spinner"></div>
                <canvas class="path-canvas"></canvas>
                ${!this._has_people && this._isLearning ? 
                    `<div class="countdown">${this._countdown}S</div>` : ''}
                <div class="buttons">
                    ${!this._isLearning ? `
                        <button class="cancel-btn">${getTranslationValue('cancel', this._hass?.language || 'en')}</button>
                        <button class="start-btn">${getTranslationValue('start', this._hass?.language || 'en')}</button>
                    ` : this._has_people ? `
                        <button class="end-btn">${getTranslationValue('end', this._hass?.language || 'en')}</button>
                    ` : ''}
                </div>
            </div>
        `;

        // 添加事件监听
        if (!this._isLearning) {
            this.shadowRoot.querySelector('.cancel-btn').addEventListener('click', () => this.remove());
            this.shadowRoot.querySelector('.start-btn').addEventListener('click', () => this.startLearning());
        } else if (this._has_people) {
            this.shadowRoot.querySelector('.end-btn').addEventListener('click', async () => {
                try {
                    // 发送结束有人学习命令
                    await this._hass.callWS({
                        type: 'airibes/learning_data',
                        learn_type: 2,              // 单人学习
                        action: false,              // 结束
                        device_id: this._device_id
                    });
                } catch (error) {
                    console.error("发送有人学习结束命令失败:", error);
                    alert(getTranslationValue('learning_end_failed', this._hass?.language || 'en'));
                }
                this.cleanup();
                this.remove();
            });
        }
    }
}

// 注册自定义元素
if (!customElements.get('learning-dialog')) {
    customElements.define('learning-dialog', LearningDialog);
} 

customElements.whenDefined('home-assistant').then(() => {
    const interval = setInterval(() => {
        const homeAssistant = document.querySelector("home-assistant");
        if (homeAssistant && homeAssistant.hass) {
            clearInterval(interval);
            homeAssistant.hass.connection.subscribeEvents((event) => {
                if (event.event_type === "airibes_btn_learn") {
                    const learningDialog = document.createElement("learning-dialog");
                    learningDialog.hasPeople = event.data.has_people;
                    learningDialog.device_id = event.data.device_id;
                    learningDialog.hass = homeAssistant.hass;
                    document.body.appendChild(learningDialog);
                }
            }, "airibes_btn_learn");
        }
    }, 100);
});
