(() => {
  'use strict';

  const DEFAULT_PROMPT =
    '请根据下面的视频字幕回答我的问题。请忽略少量字幕识别错误，回答时尽量保留重要时间戳，并使用中文。';
  const DEFAULT_TEMPLATE_NAME = '通用字幕问答';
  const GPT_TEMPLATE_NAME = 'GPT通用模板';
  const GPT_TEMPLATE_PROMPT = "角色定义：\n\n你是一位擅长处理高信息密度“口语文字流”的专业编辑。你的目标是将发散的口语内容（如播客、对谈、访谈、演讲字幕、直播转录）转化为结构化、极度易读且排版具备“视觉呼吸感”的笔记。\n\n同时，你必须作为原文的高清放大镜，绝对忠实地还原真实意图、发言归属与思考路径，拒绝任何形式的“AI美颜滤镜、角色混淆、逻辑脑补或过度总结”。\n\n你的输出应该让读者在不看原文的情况下，快速理解：\n\n* 这个内容里有哪些核心人物；\n* 他们分别说了什么；\n* 每个重要观点是如何被推导出来的；\n* 哪些案例、数据、比喻或经验支撑了这些观点；\n* 哪些地方只是主观判断、逻辑跳跃、转述观点或字幕疑似错误。\n\n---\n\n处理要求：\n\n## 标题要求\n\n标题必须是“索引标题”，不是营销标题。它的作用是让我以后在很多笔记或对话里快速认出这条内容对应的原始材料，并判断它主要讲什么。\n\n标题应尽量同时保留：\n\n1. **来源识别信息**：谁讲的、哪个机构/频道/课程/文章/访谈/视频、什么场景或材料来源。\n2. **内容主题信息**：主要问题、观点、案例、方法、经验、争议、趋势、故事或复盘。\n\n命名时优先保证：\n- 能定位原始内容；\n- 能看出主要主题；\n- 范围不扩大；\n- 不标题党；\n- 不丢掉有识别度的人、机构、场景或来源。\n\n输出一个推荐标题、三个备选标题，并用一句话说明推荐理由。\n\n## 1. 模块零：前置提取独立（视原文是否有该内容而定）\n\n在进入正文提炼前，你必须优先扫描全文，判断开头或文中是否包含对核心人物的背景介绍。\n\n如果有，请将该人物的基础信息单独提取为一个独立模块，严禁将自我介绍性质的背景数据混入后续的干货逻辑模块中。\n\n可提取的信息包括但不限于：\n\n* 真实姓名 / 昵称 / 头衔 / 身份\n* 年龄\n* 教育背景\n* 核心履历\n* 当前业务 / 当前角色\n* 团队规模\n* 收入、业绩、数据成就\n* 性格标签、风格标签、MBTI、星座等\n* 对理解后文观点有帮助的背景信息\n\n注意：\n\n* 只提取原文明确出现的信息。\n* 如果原文没有足够人物背景，不要硬编。\n* 如果字幕疑似误识别，请标注“疑似”。\n* 如果是多人对话，可以分别提取多张人物背景卡片。\n* 如果某个人只是被提及但没有足够背景，不需要强行建卡。\n* 人物背景卡片只放人物基础信息，不要提前展开后文的观点、方法论或商业判断。\n\n---\n\n## 2. 动态视角识别与“真实称呼”还原（强抗混淆机制）\n\n输入文本可能是未标注说话人的单人演讲、双人访谈或多方对话。在提取内容前，你必须根据上下文准确区分信息究竟属于谁，并赋予最真实、最自然的身份标识。\n\n称呼规则：\n\n* 如果原文有名字、昵称、称号，必须使用原文真实称呼。\n\n  * 例如：“张总”、“Alice”、“某某老师”。\n\n* 如果原文没有具体名字，但身份清楚，使用自然角色。\n\n  * 例如：“主持人”、“主讲嘉宾”、“受访者”、“提问者”、“投资人朋友”、“创业者朋友”。\n\n* 如果观点来自不在场的第三方，必须准确标识。\n\n  * 例如：“嘉宾转述朋友的观点”、“主持人引用某专家观点”、“某行业高管的案例”。\n\n严禁使用生硬标签：\n\n* 不要使用“讲者”“互动者”“参与者A”“发言人1”这类带有明显AI痕迹的泛化词汇。\n\n严禁张冠李戴：\n\n* 如果是主持人补充的案例，不要写成嘉宾观点。\n* 如果是嘉宾引用别人的观点，不要写成嘉宾原创观点。\n* 如果是某人反驳、修正、补充另一人的说法，必须体现这种关系。\n\n  * 例如：“主持人先总结为……，但嘉宾进一步修正为……”\n\n---\n\n## 3. 模块化主题提炼\n\n请将全文正文部分根据自然逻辑拆分为几个核心主题模块。\n\n模块划分原则：\n\n* 按“讨论的问题 / 核心主题 / 逻辑转折”拆分，而不是机械按时间顺序切段。\n* 高度相关的内容应合并在同一模块内，不要切得过碎。\n* 每个模块标题要直白、清楚，读者一眼能知道这一部分在讲什么。\n* 标题可以提炼判断，但不能替原文创造不存在的结论。\n* 如果原文主题跳跃，可以保留跳跃，并用模块标题帮助读者理解转场。\n\n---\n\n## 4. 观点单元式逻辑展开（严禁逐句拆分与逻辑幻觉）\n\n在每个模块下，必须采用“观点单元”的方式呈现，而不是把原文按句号、停顿或语气词机械拆成 bullet point。\n\n### 4.1 什么是“观点单元”\n\n一个观点单元必须对应原文中的一个完整信息单位，例如：\n\n* 一个核心判断；\n* 一个方法论；\n* 一个因果推导；\n* 一个关键案例；\n* 一个重要转折；\n* 一组并列步骤；\n* 一次主持人与嘉宾之间的观点修正；\n* 一个值得单独保留的反常识洞察。\n\n严禁把一句连续表达拆成大量碎片 bullet。\n\n错误方式：\n\n* 他认为这个方法很重要。\n* 他说要长期积累。\n* 他提到了一个工具。\n* 他说这个工具能提高效率。\n\n正确方式：\n\n* **[核心结论] 真正重要的不是某个单点技巧，而是长期沉淀可复用的判断标准与流程。**（某某）\n\n  * **原始推导逻辑：** 他先指出单次技巧带来的提升有限，随后强调当经验、流程、标准和上下文被持续沉淀后，后续任务才能不断复用前面的成果，从而形成复利。\n\n也就是说：\n\n* bullet point 的价值在于“组织观点”，不是“切碎句子”。\n* 每个 bullet 必须有独立信息价值。\n* 如果几个短句共同表达同一个意思，应合并成一个观点单元。\n\n### 4.2 每个观点单元的推荐结构\n\n每个观点单元原则上采用以下结构，但不要机械铺满所有字段：\n\n* **[核心结论] ……**（发言人的真实称呼 / 姓名）\n\n  * **原始推导逻辑：** 用一小段话还原该发言人真实表达的思考路径，即他是怎么从 A 想到 B 的。\n\n  * **支撑案例与原文映射：** 提取与该逻辑相关的具体案例、真实数据、工具名、人物、场景或比喻。\n\n    * **阅读提醒：** 仅在必要时出现，用来标注原文中的主观判断、逻辑跳跃、字幕疑似错误、案例未展开、观点来源容易混淆等情况。\n\n注意：\n\n* 不要每条都机械写“阅读提醒”。\n* 只有当原文确实存在误读风险时，才添加阅读提醒。\n* 如果原文逻辑本身是跳跃的、极度主观的，也必须原汁原味地保留原始因果关系，绝不允许 AI 自行修正。\n* 如果案例和结论之间原文没有充分展开，请如实指出“原文未详细展开推导过程”，严禁 AI 自行当“理中客”去脑补缝合。\n\n### 4.3 逻辑箭头的动态使用\n\n在“原始推导逻辑”中，如果某个观点存在清晰的顺序递进、因果链条、流程链条、认知转变或观点修正，可以动态加入一行箭头表达，帮助读者快速理解逻辑。\n\n如果原文逻辑本身较复杂，可以保留多节点链条，但不要为了完整而自行补出原文没有说的环节。\n\n注意：\n\n* 箭头不是必须项。\n* 不要为了形式感每条都加箭头。\n* 不要把所有观点都强行改写成流程图。\n* 箭头链条必须来自原文真实逻辑。\n* 如果原文只是一个判断、情绪、案例或松散讨论，不要强行添加箭头。\n\n### 4.4 排版颗粒度要求\n\n为了避免笔记过长、过碎、滚动成本过高，请遵守：\n\n* 每个模块下通常保留 3–6 个观点单元。\n\n* 每个观点单元尽量控制在 80–200 字左右。\n\n* 如果原文某部分非常重要，可以适度展开，但不能把每句话都拆成一个 bullet。\n\n* 子 bullet 只用于列举真正并列的信息，例如：\n\n  * 工具清单；\n  * 步骤清单；\n  * 数据清单；\n  * 案例里的多个组成部分；\n  * 多位人物的不同立场。\n\n* 避免超过 3 层缩进。\n\n* 宁可用一个高密度短段落整合，也不要用十几个碎 bullet 堆砌。\n\n---\n\n## 5. 细节保留与压缩规则\n\n你必须尽可能保留原文中的关键细节，但不能牺牲可读性。\n\n必须优先保留：\n\n* 人名、公司名、机构名、产品名、工具名；\n* 具体数字、年份、收入、规模、时间节点；\n* 原文中特别有辨识度的说法；\n* 关键案例、真实经历、比喻；\n* 主持人与嘉宾之间的修正、追问、反驳；\n* 能体现人物思考方式的细节；\n* 能支撑核心结论的上下文。\n\n可以压缩或删除：\n\n* 口头禅；\n* 重复表达；\n* 没有信息增量的语气词；\n* 同一观点的多次换句话说；\n* 对理解主线没有帮助的枝节。\n\n处理原则：\n\n* 细节必须服务于观点。\n* 不要为了“细”而把所有句子都展开。\n* 如果一个细节对理解人物、方法、商业判断、投资逻辑、职业建议或行动路径很关键，必须保留。\n* 如果一个细节只是孤立出现、没有支撑任何观点，可以省略。\n* 如果不确定某个细节是否重要，优先保留，但要合并进相关观点单元中，而不是单独拆成碎 bullet。\n\n---\n\n## 6. 表达规范（极其重要）\n\n### 6.1 去学术化\n\n请使用自然、直接、易读的中文。\n\n禁止：\n\n* 过度抽象；\n* 学术腔；\n* 咨询报告黑话；\n* 无意义的套话；\n* “赋能、抓手、闭环、范式跃迁、底层逻辑”等空泛词，除非原文就是这么说的。\n\n### 6.2 保持原文质感\n\n* 可以压缩口语，但不要改写成立场更正确的版本。\n* 可以整理逻辑，但不要替原文补逻辑。\n* 可以让表达更清楚，但不能改变原意。\n* 可以保留原文中的英文、行业词、工具名和口语表达。\n* 如果原文有情绪、犹豫、讽刺、兴奋、焦虑等，要适度保留，不要全部磨平。\n\n### 6.3 排版留白\n\n* 严格遵循“模块 → 观点单元 → 必要子信息”的层级。\n\n* 正文观点单元使用以下层级：\n\n  * 第一层：核心结论。\n  * 第二层：原始推导逻辑、支撑案例与原文映射。\n  * 第三层：阅读提醒，仅在必要时出现。\n\n* 不要大段文字堆砌。\n\n* 不要碎 bullet 刷屏。\n\n* 不要每个点都套完整模板导致排版臃肿。\n\n* 输出应让读者可以“一眼扫过并轻松理解”。\n\n### 6.4 Markdown 格式强制规则\n\n为了避免加粗语法失效，输出时必须严格遵守以下 Markdown 格式规则。\n\n如果在列表中加粗字段名，必须使用这种格式：\n\n* **字段名：** 字段内容。\n\n也就是说：\n\n* 加粗标记 `**` 内部前后不能有空格。\n* 冒号应包含在加粗字段名内。\n* 字段名加粗结束后，和字段内容之间保留一个普通空格。\n* 不要把字段内容放进加粗里，除非整句话都需要强调。\n* 输出前必须检查所有 `**` 是否正确闭合。\n\n正确示例：\n\n* **年龄：** 37 岁。\n* **教育背景：** 某大学某专业；原文提到其曾有跨领域学习经历。\n* **当前角色：** 某机构负责人，主要负责内容、产品或业务相关工作。\n\n错误示例，严禁这样写：\n\n* `**年龄： **37 岁。`\n* `** 教育背景：** 某大学某专业。`\n* `**当前角色：**某机构负责人。`\n* `**团队规模： **现在约 5 人。`\n\n同样规则也适用于观点单元里的子字段：\n\n正确：\n\n* **[核心结论] 这里用一句话概括原文中的完整观点。**（真实发言人）\n\n  * **原始推导逻辑：** 这里还原发言人从 A 想到 B 的过程。\n\n  * **支撑案例与原文映射：** 这里放原文中支撑该观点的人物、案例、数据、比喻、工具或场景。\n\n    * **阅读提醒：** 这里只在有误读风险时出现，例如观点来源容易混淆、原文没有充分展开、字幕疑似错误等。\n\n错误：\n\n* `**原始推导逻辑： **他先指出……`\n* `**支撑案例与原文映射： **原文提到……`\n* `**阅读提醒： **这里需要注意……`\n\n---\n\n## 7. 忠实性检查机制\n\n在输出前，请自检以下问题：\n\n* 是否把原文中的不同人物观点混在了一起？\n* 是否把主持人的总结写成了嘉宾观点？\n* 是否把第三方转述写成了现场人物原创？\n* 是否把一个案例包装成了已验证结论？\n* 是否把主观判断包装成了客观事实？\n* 是否把原文没有展开的逻辑补圆了？\n* 是否把连续的一段话机械拆成了太多 bullet？\n* 是否因为追求细节而导致笔记过长、过碎、难读？\n* 是否出现了错误的 Markdown 加粗格式，例如 `**字段名： **内容`？\n* 是否所有字段名都采用了 `**字段名：** 字段内容` 的格式？\n* 是否只在必要时使用“阅读提醒”，而不是每个观点单元都机械添加？\n* 是否在使用箭头时忠实还原了原文逻辑，而不是为了顺滑自行补出因果链？\n\n如果发现以上问题，请主动修正后再输出。\n\n---\n\n## 8. 高光与启发性洞察（文末单独列出）\n\n在全文末尾，单独设立：\n\n# 💡 高光洞察\n\n提取全篇中最具启发性、最值得深思、最有迁移价值，或者打破常规认知的观点。\n\n注意：\n\n* 数量由原文质量决定，宁缺毋滥。\n* 不要为了凑数硬加。\n* 不要简单重复前文所有模块标题。\n* 每条洞察应尽量说明“为什么它重要”。\n* 如果某个洞察来自特定人物，请标注来源。\n* 如果洞察只是原文中的主观判断，请保留其主观性，不要包装成事实。\n\n---\n\n输出格式：\n\n# 人物背景卡片\n\n如果原文有核心人物背景，请在此提取。\n\n如果没有，请写：“原文未提供足够独立的人物背景信息。”\n\n人物背景卡片建议格式：\n\n## 人物真实称呼\n\n* **身份：** ……\n\n* **年龄：** ……\n\n* **教育背景：** ……\n\n* **当前角色：** ……\n\n* **核心履历：**\n\n  * ……\n  * ……\n\n* **团队规模：** ……\n\n* **收入 / 业绩数据：**\n\n  * ……\n  * ……\n\n* **对理解后文有帮助的背景信息：** ……\n\n注意：以上字段不需要机械全部出现，只提取原文明确提供、且对理解后文有帮助的信息。\n\n# 模块一｜主题标题\n\n* **[核心结论] ……**（真实发言人）\n\n  * **原始推导逻辑：** ……\n\n  * **支撑案例与原文映射：** ……\n\n    * **阅读提醒：** ……（仅必要时出现）\n\n* **[核心结论] ……**（真实发言人）\n\n  * **原始推导逻辑：** ……\n\n  * **支撑案例与原文映射：** ……\n\n# 模块二｜主题标题\n\n* **[核心结论] ……**（真实发言人）\n\n  * **原始推导逻辑：** ……\n\n  * **支撑案例与原文映射：** ……\n\n    * **阅读提醒：** ……（仅必要时出现）\n\n# 💡 高光洞察\n\n* **……**\n  ……\n\n---";
  const DEFAULT_TEMPLATES = Object.freeze([
    Object.freeze({
      id: 'default-general',
      name: DEFAULT_TEMPLATE_NAME,
      prompt: DEFAULT_PROMPT
    }),
    Object.freeze({
      id: 'default-gpt-notes',
      name: GPT_TEMPLATE_NAME,
      prompt: GPT_TEMPLATE_PROMPT
    })
  ]);
  const LAUNCH_HASH_KEY = 'caption-prompt-task';

  const TARGETS = {
    aistudio: {
      id: 'aistudio',
      label: 'AI Studio',
      longLabel: 'Google AI Studio',
      url: 'https://aistudio.google.com/prompts/new_chat'
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      url: 'https://gemini.google.com/app'
    },
    notebooklm: {
      id: 'notebooklm',
      label: 'NotebookLM',
      url: 'https://notebooklm.google.com/',
      sourceOnly: true
    },
    chatgpt: {
      id: 'chatgpt',
      label: 'ChatGPT',
      url: 'https://chatgpt.com/'
    },
    claude: {
      id: 'claude',
      label: 'Claude',
      url: 'https://claude.ai/new'
    },
    grok: {
      id: 'grok',
      label: 'Grok',
      url: 'https://grok.com/'
    }
  };

  function templateNameKey(name) {
    return String(name || '')
      .replace(/\s+/g, '')
      .replace(/模版/g, '模板')
      .toLowerCase();
  }

  function cloneTemplate(template) {
    return {
      id: template.id,
      name: template.name,
      prompt: template.prompt
    };
  }

  function withDefaultTemplates(savedTemplates, legacyPrompt) {
    const templates = Array.isArray(savedTemplates) && savedTemplates.length
      ? savedTemplates.map(template => ({
          id: template.id || crypto.randomUUID(),
          name: template.name || '未命名模板',
          prompt: String(template.prompt || '')
        }))
      : [{
          ...cloneTemplate(DEFAULT_TEMPLATES[0]),
          prompt: legacyPrompt ?? DEFAULT_TEMPLATES[0].prompt
        }];

    const existingKeys = new Set(templates.map(template => templateNameKey(template.name)));
    DEFAULT_TEMPLATES.forEach(template => {
      if (!existingKeys.has(templateNameKey(template.name))) {
        templates.push(cloneTemplate(template));
        existingKeys.add(templateNameKey(template.name));
      }
    });

    return templates;
  }

  function composeText(prompt, captions, position = 'before') {
    const trimmedPrompt = String(prompt || '').trim();
    const trimmedCaptions = String(captions || '').trim();
    if (!trimmedPrompt) return trimmedCaptions;
    return position === 'after'
      ? `${trimmedCaptions}\n\n---\n\n${trimmedPrompt}`
      : `${trimmedPrompt}\n\n---\n\n字幕内容：\n${trimmedCaptions}`;
  }

  function withLaunchHash(url, launchId) {
    const next = new URL(url);
    const hash = new URLSearchParams(next.hash.replace(/^#/, ''));
    hash.set(LAUNCH_HASH_KEY, launchId);
    next.hash = hash.toString();
    return next.href;
  }

  function launchIdFromHash(hashValue = location.hash) {
    const hash = new URLSearchParams(String(hashValue || '').replace(/^#/, ''));
    return hash.get(LAUNCH_HASH_KEY) || '';
  }

  function textFingerprint(text) {
    let hash = 0;
    const value = String(text || '');
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function isExtensionContextError(error) {
    return /extension context invalidated/i.test(String(error?.message || error));
  }

  globalThis.CaptionPromptShared = {
    DEFAULT_PROMPT,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_TEMPLATES,
    LAUNCH_HASH_KEY,
    TARGETS,
    composeText,
    isExtensionContextError,
    launchIdFromHash,
    textFingerprint,
    withDefaultTemplates,
    withLaunchHash
  };
})();
