#!/bin/bash

tar="$1"
name="${tar%%.*}"

tar --zstd -xvf $tar -C $name

python convert.py ~/Downloads/llama3-flowbite --outfile models/ggml-llama3-flowbite-f16.gguf --vocab-type bpe --outtype f16
./quantize ./models/ggml-llama3-flowbite-f16.gguf ./models/ggml-llama3-flowbite-q4_0.gguf q4_0

echo `FROM ./models/ggml-llama3-flowbite-q4_0.gguf
TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""
PARAMETER num_keep 24
PARAMETER stop "<|start_header_id|>"
PARAMETER stop "<|end_header_id|>"
PARAMETER stop "<|eot_id|>"` > Modelfile

ollama create llama3:openui -f Modefile