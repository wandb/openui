from typing import Optional, List, Dict, Any

import autogen
from autogen import GroupChat, ConversableAgent, Agent, ChatResult
from autogen import GroupChatManager
from .config_list import config_list_mistral, config_list_gpt3
# config_list_codellama = [

#         {
#             "base_url": "http://localhost:8000",
#             "model": "ollama/codellama",
#             "api_key": "NULL"
#         }

#     ]

# config_list_mistral = [
#         {
#             "base_url": "http://localhost:8000",
#             "model": "ollama/mistral",
#             "api_key": "NULL"
#         }
# ]

# config_list_gpt3 = [
#         {
#             "base_url": "https://api.xi-ai.cn/v1/",
#             "model": "gpt-3.5-turbo-0125",
#             "api_key": "sk-R4CHScV8PAemcoV8E2DaC1EbF8014aD2842a7d6a20253cCd"
#         }
# ]

class GroupChat:
    CODER_DATA = """
           You're a frontend web developer that specializes in tailwindcss. Given a description or an image,
           generate HTML with tailwindcss. You should support both dark and light mode. It should render nicely on desktop, tablet, 
           and mobile. Keep your responses concise and just return HTML that would appear in the <body> no need for <head>.
           Use placehold.co for placeholder images. 
           If the user asks for interactivity, 
           use modern ES6 javascript and native browser apis to handle events.
           If the user provides JSON fields, the corresponding HTML needs to be generated based on the JSON fields provided by the user.    
           """
    DESIGN_DATA = """
         角色：UI设计师
    技能1：具备一定的审美能力，能够设计出简约而优雅的UI方案。
    技能2：提供可实现且合理的设计方案，考虑到技术实现的可行性和用户体验的综合性。
    技能2：对于页面主题颜色，按钮样式，元素布局方式需要有详细的描述
           """
    PROD_DATA = """
                    角色：产品经理

    技能1：设计简约易懂的产品方案，能够清晰明了地传达产品需求和功能要求给UI设计师和前端工程师。

    技能2：具备良好的沟通能力和解释能力，能够通俗易懂地向团队成员解释要做的事情，并按步骤整理好任务流程，以确保团队高效协作。
    技能3：需要根据用户提示，确定页面需要包含的字段，以及每个字段的展示方式，
                """
    fronent_coder = autogen.AssistantAgent("fronent_coder", llm_config={"config_list": config_list_gpt3},
                                           system_message=CODER_DATA,
                                           max_consecutive_auto_reply=1)
    # fronent_coder.description = CODER_DATA
    ui_designer = autogen.AssistantAgent("ui_designer", llm_config={"config_list": config_list_gpt3},
                                         system_message=DESIGN_DATA,
                                         max_consecutive_auto_reply=1)
    ui_designer.description = "一个ui设计师，根据产品经理的方案确定ui方案的设计"
    Product_Manager = autogen.AssistantAgent("Product_Manager", llm_config={"config_list": config_list_gpt3},
                                             system_message=PROD_DATA,
                                             max_consecutive_auto_reply=1)
    Product_Manager.description = "一个产品经理，根据用户需要做出好的产品"

    def callBack(
            recipient: ConversableAgent,
            messages: Optional[List[Dict]] = None,
            sender: Optional[Agent] = None,
            config: Optional[Any] = None,
    ):
        if messages is not None and messages[-1] is not None:
            print("Dddd", messages[-1]["content"])
        return (True, None)

    host = autogen.UserProxyAgent("host",

                                  llm_config={"config_list": config_list_gpt3},
                                  code_execution_config={"work_dir": "coding", "use_docker": False})
    host.register_reply([Agent], callBack)



    allowed_transitions = {
        Product_Manager: [ui_designer, ],
        ui_designer: [fronent_coder]

    }

    group_chat = GroupChat(
        agents=[fronent_coder, ui_designer, Product_Manager],
        speaker_selection_method="auto",
        messages=[],
        max_round=5,
        allowed_or_disallowed_speaker_transitions=allowed_transitions,
        speaker_transitions_type="allowed",
        send_introductions=True,
    )

    group_chat_manager = GroupChatManager(
        groupchat=group_chat,
        llm_config={"config_list": config_list_gpt3},
    )
    promt = "请帮我写一个登录页面"

    def startGroupChat(self,promt):
        return  self.host.initiate_chat(
            self.group_chat_manager,
            message=promt

        )
        print(chat_result)

    def startqueueChat(self,promt)->List[ChatResult]:
        chat_result=self.host.initiate_chats(
        [
                {
                    "recipient":  self.Product_Manager,
                    "message": promt,
                    "max_turns": 2,
                    "summary_method": "last_msg",
                },
                {
                    "recipient": self.ui_designer,
                    "message": promt,
                    "max_turns": 1,
                    "summary_method": "last_msg",
                },
                {
                    "recipient": self.fronent_coder,
                    "message": promt,
                    "max_turns": 1,
                    "summary_method": "last_msg",
                }
            ]
        )
        print(chat_result)
        return  chat_result


groupChat=GroupChat()
#groupChat.startGroupChat("帮我写一个登录页面")
groupChat.startqueueChat("帮我写一个登录页面")

