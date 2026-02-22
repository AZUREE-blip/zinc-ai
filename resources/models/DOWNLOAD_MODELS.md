# AI Models for Zinc.ai / AI Boss

These models are BUNDLED with the app. Users don't need to download anything.
This guide is for developers setting up the build environment.

## Required Models

### 1. Text Model: Phi-2 (Q4_K_M quantization)
- **File:** `phi-2.Q4_K_M.gguf`
- **Size:** ~1.5 GB
- **RAM Required:** ~3 GB
- **Purpose:** Action planning, text generation, reasoning

**Download:**
```bash
# Using huggingface-cli
huggingface-cli download TheBloke/phi-2-GGUF phi-2.Q4_K_M.gguf --local-dir .

# Or direct download
curl -L -o phi-2.Q4_K_M.gguf "https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.Q4_K_M.gguf"
```

### 2. Vision Model: LLaVA-v1.5-7B (Q4_K quantization)
- **File:** `llava-v1.5-7b-Q4_K.gguf`
- **Size:** ~4 GB
- **RAM Required:** ~6 GB
- **Purpose:** Screen analysis, understanding what user sees

**Download:**
```bash
# Using huggingface-cli
huggingface-cli download mys/ggml_llava-v1.5-7b ggml-model-q4_k.gguf --local-dir .
mv ggml-model-q4_k.gguf llava-v1.5-7b-Q4_K.gguf

# Or direct download
curl -L -o llava-v1.5-7b-Q4_K.gguf "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/ggml-model-q4_k.gguf"
```

### 3. Vision Projector (required for LLaVA)
- **File:** `mmproj-model-f16.gguf`
- **Size:** ~600 MB
- **Purpose:** Connects vision encoder to language model

**Download:**
```bash
# Using huggingface-cli
huggingface-cli download mys/ggml_llava-v1.5-7b mmproj-model-f16.gguf --local-dir .

# Or direct download
curl -L -o mmproj-model-f16.gguf "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/mmproj-model-f16.gguf"
```

## Directory Structure After Download

```
resources/models/
  phi-2.Q4_K_M.gguf           (~1.5 GB) - Text generation
  llava-v1.5-7b-Q4_K.gguf     (~4.0 GB) - Vision model
  mmproj-model-f16.gguf       (~600 MB) - Vision projector
  DOWNLOAD_MODELS.md          (this file)
```

## Total Size
- **Development:** ~6.1 GB in models folder
- **Production build:** ~6.3 GB total app size

## Notes

1. These models run LOCALLY - no internet required after install
2. All inference happens on the user's PC
3. Screenshots and data never leave the device
4. GPU acceleration used if available (CUDA/Metal)
5. Falls back to CPU if no GPU

## Minimum System Requirements

- **RAM:** 8 GB minimum, 16 GB recommended
- **Storage:** 8 GB free space
- **GPU (optional):** Any CUDA-compatible GPU with 4+ GB VRAM
- **CPU:** Modern 4-core processor

## Alternative: Smaller Models

If app size is a concern, you can use smaller models:

### Smaller Text Model: TinyLlama
- **File:** `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`
- **Size:** ~670 MB
- Trade-off: Less capable reasoning

### Smaller Vision Model: Moondream2
- **File:** `moondream2-text-model-f16.gguf`
- **Size:** ~1.5 GB
- Trade-off: Less accurate screen understanding

For production, we recommend the full-size models for best user experience.
