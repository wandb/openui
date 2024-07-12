import weave
import pandas as pd
import traceback
from typing import Callable, Optional
from pydantic import BaseModel
import openai
import random
from weave import Dataset
from weave import Object
from weave import Model
from weave import Evaluation
import asyncio

mutation_prompts = [
    """Given the following prompt template for an LLM, write me a better prompt.""",
    """Rewrite the following prompt template but don't use any of the same words""",
    """Change the instructions of the following prompt to make it more fun, think outside the box"""
    """Embrace unconventional ideas and mutate the prompt in a way that surprises and inspires unique variations."""
]


class PromptModel(weave.Model):
    model_name: str
    prompt_template: str


class PromptSearchParams(BaseModel):
    use_best_prompt_freq: float = 0.5
    use_random_prompt_freq: float = 0.2
    use_learnings_freq: float = 0.5


default_search_params = PromptSearchParams()


class PromptSearch(BaseModel):
    '''
        Searches for better prompts.

        Tries mutating the prompt by asking llm for a better prompt.
        Tries looking at previous evaluation runs and asking the llm
            for learnings and then tries to use those learnings to
            improve the prompt.

        Example:
            dataset = weave.ref(dataset_name).get()

            model = HSModel(model_name='gpt-4o', prompt_template=initial_prompt_template)

            evaluation = weave.Evaluation(
                dataset=dataset, scorers=[score])

            ps = PromptSearch(model=model, dataset=dataset, evaluation=evaluation)
            ps.steps(10)

    '''

    model: PromptModel
    dataset: Dataset
    evaluation: Evaluation
    eval_result_to_score: Optional[Callable[[dict], float]] = None
    prompt_search_name: str = ''
    params: PromptSearchParams = default_search_params

    def _set_prompt_search_name(self):
        self.prompt_search_name = self.model.model_name + "-" + self.dataset.name

    def _get_openai_response(self, prompt: str) -> str:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}])

        return response.choices[0].message.content

    def _get_llm_response(self, prompt: str) -> str:
        return self._get_openai_response(prompt)

    def _extract_new_prompt_from_response(self, response: str) -> str:
        start_index = response.find(
            "START PROMPT") + len("START PROMPT")
        end_index = response.find("END PROMPT")
        new_prompt_template = response[start_index:end_index].strip(
        )
        return new_prompt_template

    def mutate_template(self, prompt_template: str) -> str:
        mutate_prompt_template = """{instruction}

            Initial prompt: 
            {prompt_template}
            
            Start the new prompt with START PROMPT and end the new prompt with END PROMPT. I'm going to
            use an automated script to extract the prompt so those words need to match exactly. I'm going to 
            replace everything inside the curly brackets with values from a dataset so don't use curly
            brackets except as a template.       
            """

        selected_mutation = random.choice(mutation_prompts)

        new_prompt_template_response = self._get_llm_response(
            mutate_prompt_template.format(prompt_template=prompt_template, instruction=selected_mutation))

        new_prompt_template = self._extract_new_prompt_from_response(
            new_prompt_template_response)

        return new_prompt_template

    def mutate_template_with_learnings(self, prompt_template: str, learning_list: list) -> str:
        mutate_prompt_template = """Given the following prompt template for an LLM, write me a better prompt. 

            Initial prompt: 
            {prompt_template}

            {learning_list_str}
            
            Start the new prompt with START PROMPT and end the new prompt with END PROMPT. I'm going to
            use an automated script to extract the prompt so those words need to match exactly. I'm going to 
            replace everything inside the curly brackets with values from a dataset so don't use curly
            brackets except as a template.        
            """

        if len(learning_list) > 0:
            learning_list_str = f""" 
                Some learnings from comparing prompts that worked well vs some that didn't:
            """ + "\n".join(learning_list)
        else:
            learning_list_str = ""

        new_prompt_template_response = self._get_llm_response(
            mutate_prompt_template.format(prompt_template=prompt_template, learning_list_str=learning_list_str))
        # print(new_prompt_template_response)

        new_prompt_template = self._extract_new_prompt_from_response(
            new_prompt_template_response)

        return new_prompt_template

    def get_learnings_from_pair(self, prompt_template_a: str, prompt_score_a: float, prompt_template_b: str, prompt_score_b: float) -> list:
        get_learnings_template = """
            Here are two prompt templates given to an LLM to complete a task.
            Prompt A got a score: {prompt_score_a}
            Prompt B got a score: {prompt_score_b}

            Prompt A: {prompt_template_a}
            Prompt B: {prompt_template_b}

            What are some possible learnings we could take from these two scores to inform making a better prompt template?
            Please write the learnings that are most clear from the data first.

            Please start each learning with the word LEARNING: in all caps. I'm going to use an automated script
            so it needs to match this format exactly. Keep the learning all in one line.
        """
        learnings_response = self._get_llm_response(
            get_learnings_template.format(prompt_score_a=prompt_score_a, prompt_score_b=prompt_score_b,
                                          prompt_template_a=prompt_template_a, prompt_template_b=prompt_template_b))

        learnings = []
        for line in learnings_response.split('\n'):
            line = line.strip()
            if line.startswith("LEARNING:"):
                clean_line = line.split("LEARNING:", 1)[1].strip()
                learnings.append(clean_line)
        return learnings

    def get_learnings_from_random_rows(self, score_dataset_rows: list) -> list:
        score_dataset_df = pd.DataFrame(score_dataset_rows)
        random_rows = score_dataset_df.sample(n=2)
        random_row_A = random_rows.iloc[0]
        random_row_B = random_rows.iloc[1]
        prompt_template_a = str(random_row_A['prompt_template'])
        prompt_score_a = float(random_row_A['prompt_score'])
        prompt_template_b = str(random_row_B['prompt_template'])
        prompt_score_b = float(random_row_B['prompt_score'])
        if (prompt_score_a == prompt_score_b and random.random() < 0.9):
            return self.get_learnings_from_random_rows(score_dataset_rows)

        lr = self.get_learnings_from_pair(prompt_template_a, prompt_score_a,
                                          prompt_template_b, prompt_score_b)
        return lr

    def get_learnings_from_best_vs_random_rows(self, score_dataset_rows: list) -> list:
        score_dataset_df = pd.DataFrame(score_dataset_rows)
        best_row = score_dataset_df.loc[score_dataset_df['prompt_score'].idxmax(
        )]
        best_prompt = str(best_row['prompt_template'])
        best_score = float(best_row['prompt_score'])
        random_row = score_dataset_df.sample(n=1).iloc[0]
        random_prompt = str(random_row['prompt_template'])
        random_score = float(random_row['prompt_score'])
        if (best_score == random_score and random.random() < 0.9):
            return self.get_learnings_from_best_vs_random_rows(score_dataset_rows)
        lr = self.get_learnings_from_pair(random_prompt, random_score,
                                          best_prompt, best_score)
        return lr

    def _get_last_prompt(self, score_dataset_rows: list):
        score_dataset_df = pd.DataFrame(score_dataset_rows)
        last_row = score_dataset_df.iloc[-1]
        last_prompt = str(last_row['prompt_template'])
        return last_prompt

    def _get_random_prompt(self, score_dataset_rows: list):
        score_dataset_df = pd.DataFrame(score_dataset_rows)
        random_row = score_dataset_df.sample(n=1).iloc[0]
        random_prompt = str(random_row['prompt_template'])
        return random_prompt

    def _get_best_prompt(self, score_dataset_rows: list):
        score_dataset_df = pd.DataFrame(score_dataset_rows)
        best_row = score_dataset_df.loc[score_dataset_df['prompt_score'].idxmax(
        )]
        best_prompt = str(best_row['prompt_template'])
        return best_prompt

    def gen_next_template(self, score_dataset_rows: list):
        r = random.random()
        if r < self.params.use_best_prompt_freq:
            start_prompt = self._get_best_prompt(score_dataset_rows)
        elif r < self.params.use_best_prompt_freq + self.params.use_random_prompt_freq:
            start_prompt = self._get_random_prompt(score_dataset_rows)
        else:
            start_prompt = self._get_last_prompt(score_dataset_rows)

        r2 = random.random()
        if (r2 < self.params.use_learnings_freq and len(score_dataset_rows) > 3):
            learning_list = self.get_learnings_from_dataset_rows(
                score_dataset_rows)
            new_template = self.mutate_template_with_learnings(
                start_prompt, learning_list)
        else:
            new_template = self.mutate_template(start_prompt)

        return new_template

        # return mutate_random_template(score_dataset_rows, learning_list)

    def _score_dataset_append(self, score_dataset_rows: list, prompt_template: str, prompt_score: float):
        self.score_dataset_rows.append(
            {'prompt_score': prompt_score, 'prompt_template': prompt_template})

    def _get_dataset_rows(self, prompt_dataset_name: str):
        score_dataset_ref = weave.ref(self.prompt_search_name)
        score_dataset_rows = []
        try:
            score_dataset = score_dataset_ref.get()
            score_dataset_rows = []
            for row in score_dataset.rows:
                score_dataset_rows.append(row)
            print("Loaded rows")
        except Exception as e:
            print(e)
            # print e stack trace
            traceback.print_exc()

        return score_dataset_rows

    def get_learnings_from_dataset_rows(self, dataset_rows: list) -> list:
        learning1 = self.get_learnings_from_random_rows(dataset_rows)
        learning2 = self.get_learnings_from_best_vs_random_rows(dataset_rows)
        return learning1 + learning2

    def _eval_prompt_model_on_dataset(self):
        result = asyncio.run(self.evaluation.evaluate(self.model))
        if (self.eval_result_to_score != None):
            prompt_score = self.eval_result_to_score(result)
        else:
            prompt_score = result['score']['correct']['true_fraction']
        return prompt_score

    def get_learnings(self) -> list:
        score_dataset_rows = self.get_dataset_rows(self.prompt_search_name)
        learnings = self.get_learnings_from_dataset_rows(score_dataset_rows)
        print(learnings)
        return learnings

    def step(self):
        if (self.prompt_search_name == ''):
            self._set_prompt_search_name()
        score_dataset_rows = self._get_dataset_rows(self.prompt_search_name)

        if (len(score_dataset_rows) == 0):
            new_prompt_template = self.model.prompt_template
        else:
            new_prompt_template = self.gen_next_template(
                score_dataset_rows)

        # breakpoint()
        self.model.prompt_template = new_prompt_template
        prompt_score = self._eval_prompt_model_on_dataset()

        score_dataset_rows.append(
            {'prompt_score': prompt_score, 'prompt_template': new_prompt_template})

        weave.publish(Dataset(name=self.prompt_search_name,
                              rows=score_dataset_rows))

    def steps(self, n: int):
        for i in range(n):
            self.step()