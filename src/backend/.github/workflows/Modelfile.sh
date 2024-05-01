ollama pull llama2
echo "FROM llama2" >> Modelfile
echo "SYSTEM You are a friendly assistant." >> Modelfile
ollama create -f Modelfile generalli/openui.db
ollama push generalli/openui.db