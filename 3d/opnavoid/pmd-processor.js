/**
 * AudioWorklet processor for PMD playback.
 * Reads samples from SharedArrayBuffer ring buffer.
 */

const WRITE_IDX = 0;
const READ_IDX = 1;

class PmdProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.buffer = null;
    this.state = null;
    this.capacity = 0;
    this.channels = 2;
    this.initialized = false;

    const processorOptions = options?.processorOptions;
    if (processorOptions) {
      this.capacity = processorOptions.capacity;
      this.channels = processorOptions.channels;
    }

    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        const { sharedBuffer, capacity, channels } = event.data;
        this.capacity = capacity;
        this.channels = channels;

        const stateBytes = 2 * Int32Array.BYTES_PER_ELEMENT;
        this.state = new Int32Array(sharedBuffer, 0, 2);
        this.buffer = new Float32Array(sharedBuffer, stateBytes, capacity * channels);
        this.initialized = true;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] ?? left;
    const frameCount = left.length;

    if (!this.initialized || !this.state || !this.buffer) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    const framesRead = this.readFromBuffer(left, right, frameCount);

    // Fill remaining with silence if underrun
    if (framesRead < frameCount) {
      for (let i = framesRead; i < frameCount; i++) {
        left[i] = 0;
        right[i] = 0;
      }
    }

    return true;
  }

  readFromBuffer(left, right, frameCount) {
    const writeIdx = Atomics.load(this.state, WRITE_IDX);
    const readIdx = Atomics.load(this.state, READ_IDX);
    const available = (writeIdx - readIdx + this.capacity) % this.capacity;
    const framesToRead = Math.min(available, frameCount);

    if (framesToRead === 0) return 0;

    let idx = readIdx;
    for (let frame = 0; frame < framesToRead; frame++) {
      const bufferOffset = idx * this.channels;
      left[frame] = this.buffer[bufferOffset];
      right[frame] = this.channels > 1 ? this.buffer[bufferOffset + 1] : this.buffer[bufferOffset];
      idx = (idx + 1) % this.capacity;
    }

    Atomics.store(this.state, READ_IDX, idx);
    return framesToRead;
  }
}

registerProcessor('pmd-processor', PmdProcessor);
