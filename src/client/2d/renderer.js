/**
 * 2D Canvas Renderer
 */
export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.plcData = { position: 0, speed: 0 };

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /**
   * Resize canvas
   */
  resize() {
    this.width = this.canvas.offsetWidth;
    this.height = this.canvas.offsetHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /**
   * Update PLC data
   */
  updateData(data) {
    // IMPORTANT: Animations depend on pos (DB1001.BYTE2), not clock
    // position = status (DB1001.BYTE0) scaled 0-255
    // speed = pos (DB1001.BYTE2) scaled 0-255
    this.plcData = {
      position:
        data.status !== undefined
          ? data.status
          : data.byte1 !== undefined
            ? data.byte1
            : data.position || 0,
      speed:
        data.pos !== undefined ? data.pos : data.byte2 !== undefined ? data.byte2 : data.speed || 0,
    };
  }

  /**
   * Render frame
   */
  render() {
    const ctx = this.ctx;

    // Clear with fade effect
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw position indicator (horizontal line)
    const x = (this.plcData.position * 50 + this.width / 2) % this.width;
    ctx.fillStyle = "#667eea";
    ctx.fillRect(x - 2, this.height / 2 - 20, 4, 40);

    // Draw speed indicator (circle)
    const radius = Math.abs(this.plcData.speed * 10) + 5;
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(118, 75, 162, 0.6)";
    ctx.fill();

    // Draw text
    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    ctx.fillText(`Position: ${this.plcData.position.toFixed(2)}`, 20, 30);
    ctx.fillText(`Speed: ${this.plcData.speed.toFixed(2)}`, 20, 50);
  }
}
