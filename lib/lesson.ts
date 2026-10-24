// 备课模块核心：预设课文 / 模板教案 / AI 生成 / PPT 导出
import type { LessonPlanContent, LessonSettings } from '@/lib/types';
import { aiGenerate, hasAiConfig } from '@/lib/ai';

// 部编版初中语文课文（常用篇目，可自定义补充）
export const TEXTBOOK_LESSONS: Record<string, string[]> = {
  初一上: [
    '春（朱自清）',
    '济南的冬天（老舍）',
    '雨的四季（刘湛秋）',
    '古代诗歌四首（观沧海·闻王昌龄左迁龙标遥有此寄·次北固山下·天净沙·秋思）',
    '秋天的怀念（史铁生）',
    '散步（莫怀戚）',
    '散文诗二首（金色花·荷叶母亲）',
    '世说新语二则（咏雪·陈太丘与友期行）',
    '从百草园到三味书屋（鲁迅）',
    '再塑生命的人（海伦·凯勒）',
    '论语十二章',
    '纪念白求恩（毛泽东）',
    '植树的牧羊人（让·乔诺）',
    '走一步，再走一步（莫顿·亨特）',
    '诫子书（诸葛亮）',
    '猫（郑振铎）',
    '狼（蒲松龄）',
    '皇帝的新装（安徒生）',
    '天上的街市（郭沫若）',
    '女娲造人（袁珂）',
  ],
  初一下: [
    '邓稼先（杨振宁）',
    '说和做——记闻一多先生言行片段（臧克家）',
    '回忆鲁迅先生（萧红）',
    '孙权劝学（资治通鉴）',
    '黄河颂（光未然）',
    '老山界（陆定一）',
    '土地的誓言（端木蕻良）',
    '木兰诗',
    '阿长与《山海经》（鲁迅）',
    '老王（杨绛）',
    '台阶（李森祥）',
    '卖油翁（欧阳修）',
    '叶圣陶先生二三事（张中行）',
    '驿路梨花（彭荆风）',
    '最苦与最乐（梁启超）',
    '短文两篇（陋室铭·爱莲说）',
    '紫藤萝瀑布（宗璞）',
    '一棵小桃树（贾平凹）',
    '古代诗歌五首',
    '伟大的悲剧（茨威格）',
    '太空一日（杨利伟）',
    '带上她的眼睛（刘慈欣）',
    '河中石兽（纪昀）',
  ],
};

export const LESSON_STEPS = [
  '情境导入',
  '初读感知',
  '精读品味',
  '研读探究',
  '拓展延伸',
  '课堂小结',
];

export const LESSON_GOAL_DIMS = [
  '语言建构与运用',
  '思维发展与提升',
  '审美鉴赏与创造',
  '文化传承与理解',
];

export const LESSON_STYLES = ['启发探究型', '活泼互动型', '严谨学术型', '传统讲授型'];

// ---------- 部编版初一课文精编知识库（本地生成"可直接用"教案） ----------
interface LessonNote {
  genre: string; // 散文/抒情散文/叙事散文/文言文/诗歌/乐府民歌/童话/小说/说明文
  author: string;
  theme: string; // 主题一句话
  technique: string; // 主要写法
  questions: string[]; // 核心问题
  keyPoints: string[]; // 教学重点
  difficulties: string[]; // 教学难点
  board: string; // 板书结构
  opening: string; // 导入点子
  reflection: string; // 反思预设
}

const LESSON_NOTES: Record<string, LessonNote> = {
  '春（朱自清）': {
    genre: '抒情散文', author: '朱自清',
    theme: '赞美春天蓬勃的生命力，表达对生活的热爱与希望',
    technique: '多感官描写、比喻拟人、总分总结构',
    questions: ['作者从哪几个方面描绘春天？', '你最喜欢哪一幅"春景图"？它美在哪里？', '结尾三个比喻为什么被称为"新、美、力"？'],
    keyPoints: ['品味生动传神的语言，学习多角度写景的方法', '体会作者对春天的热爱与赞美之情'],
    difficulties: ['理解结尾三个比喻的深层含义'],
    board: '春\n盼春（急切）→ 绘春（草/花/风/雨/人）→ 赞春（新·美·力）',
    opening: '播放春天的影像/出示四季图片，问：春天在你的眼里是什么颜色？引出朱自清笔下"从头到脚都是新的"的春天。',
    reflection: '预设：学生对修辞手法的赏析停留在"找比喻"层面 → 应对：出示例句对比"改为普通写法"的效果，引导体会表达之妙。',
  },
  '济南的冬天（老舍）': {
    genre: '抒情散文', author: '老舍',
    theme: '济南冬天"温晴"的特点，表达对济南的眷恋与赞美',
    technique: '对比、拟人、情景交融',
    questions: ['济南的冬天"温晴"的特点体现在哪些语句？', '老舍是怎样把冬天写得温暖可爱的？', '文中"济南真算是个宝地"贯穿了怎样的情感？'],
    keyPoints: ['抓住"温晴"这一文眼，学习围绕特点描写景物', '品味拟人化的语言'],
    difficulties: ['理解"情景交融"：景物的温暖来自作者情感的投射'],
    board: '济南的冬天\n总：宝地（温晴）→ 分：阳光下的山 / 雪后的山 / 水 → 总：摇篮中的济南',
    opening: '回忆《春》导入：同是写景，老舍笔下的济南冬天为何"温晴"？济南的冬天与北方的冬天有什么不同？',
    reflection: '预设：学生容易把"温晴"理解为气温 → 应对：引导从"阳光""水不结冰"等细节找依据，落实文本。',
  },
  '秋天的怀念（史铁生）': {
    genre: '叙事散文', author: '史铁生',
    theme: '母亲无私而隐忍的爱，以及"好好儿活"的生命感悟',
    technique: '细节描写、以小见大、反复出现的"好好儿活"',
    questions: ['母亲的"隐忍"体现在哪些细节中？', '"好好儿活"出现了几次？每次的含义有什么不同？', '作者为什么在秋天怀念母亲？'],
    keyPoints: ['从细节描写中感受母爱的深沉', '理解"好好儿活"的含义'],
    difficulties: ['理解作者双腿瘫痪后的绝望与母亲双重痛苦下的隐忍'],
    board: '秋天的怀念\n我：暴怒→绝望  母亲：隐忍→倒下\n"好好儿活"（我领悟——勇敢、热爱、珍惜）',
    opening: '出示"树欲静而风不止，子欲养而亲不待"，提问：当爱来不及表达时，我们会如何怀念？引入史铁生与母亲的故事。',
    reflection: '预设：学生对"我"的暴怒不理解 → 应对：补充史铁生21岁截瘫的背景，引导学生代入体会。',
  },
  '散步（莫怀戚）': {
    genre: '叙事散文', author: '莫怀戚',
    theme: '尊老爱幼、生命传承与家庭责任',
    technique: '以小见大、对称句、景物烘托',
    questions: ['文章为什么选"散步"这件小事来写？', '面对分歧，"我"为什么决定走大路？', '结尾"我背母亲、妻子背儿子"有何深意？'],
    keyPoints: ['理解"小事见大"的写法', '体会一家人之间互相体谅的亲情'],
    difficulties: ['理解结尾对"生命""责任"的升华'],
    board: '散步\n分歧：走大路（母亲）vs 走小路（儿子）\n"我"决定：走大路（尊老）→ 母亲改走小路（爱幼）\n背起：整个世界（责任与生命）',
    opening: '提问：你陪家人散过步吗？散步时发生过什么分歧？引出"一件小事里的深情"。',
    reflection: '预设：学生对"整个世界"的理解停留表面 → 应对：联系"我"和妻子作为中年人的双重责任讲解。',
  },
  '从百草园到三味书屋（鲁迅）': {
    genre: '散文', author: '鲁迅',
    theme: '童年乐园的趣味与私塾生活的成长',
    technique: '对比、白描、动静结合',
    questions: ['百草园为什么是"我的乐园"？', '三味书屋的"乐"与百草园的"乐"有什么不同？', '作者对三味书屋的生活是怀念还是批判？'],
    keyPoints: ['学习"不必说…也不必说…单是…"的句式与写景方法', '理解对比中表达的情感'],
    difficulties: ['辩证理解作者对百草园与三味书屋的不同情感'],
    board: '从百草园到三味书屋\n百草园：乐园（景物·故事·雪地捕鸟）\n三味书屋：书斋（读书·描绣像·偷玩）\n童年：自由之乐 → 成长之趣',
    opening: '提问：你的童年里有没有一块"秘密基地"？鲁迅的百草园里有什么？引出课文。',
    reflection: '预设：学生易将三味书屋简单归为"封建教育" → 应对：抓住"后园的乐""描绣像"等细节，引导学生看到童年的另一面。',
  },
  '论语十二章': {
    genre: '文言文', author: '孔子及弟子',
    theme: '学习的态度、方法与修身之道',
    technique: '语录体、对话体、格言警句',
    questions: ['哪些章句谈"学习"？哪些谈"修身"？', '任选一章，说说它对你有什么启示？', '"温故而知新"体现了怎样的学习方法？'],
    keyPoints: ['理解重点文言词语，疏通文意', '归纳关于学习态度与方法的章句'],
    difficulties: ['结合自身体验理解章句的现实意义'],
    board: '论语十二章\n学习：学而时习 / 温故知新 / 学思结合 / 三人行必有我师\n修身：三省吾身 / 志于学 / 择善而从',
    opening: '提问：你知道哪些出自《论语》的成语或名言？引出"半部论语治天下"的话题。',
    reflection: '预设：学生觉得文言文枯燥 → 应对：用成语接龙、生活情境让章句"活"起来。',
  },
  '诫子书（诸葛亮）': {
    genre: '文言文', author: '诸葛亮',
    theme: '修身养德、宁静致远，父辈对子女的殷切期望',
    technique: '家书说理、正反对比',
    questions: ['诸葛亮认为成才需要具备哪些条件？', '"静"与"俭"对修身有什么作用？', '本文对你有怎样的启示？'],
    keyPoints: ['疏通文意，积累重点词语', '理解"静以修身，俭以养德"的深意'],
    difficulties: ['理解"志""学""才"三者之间的关系'],
    board: '诫子书\n静以修身 俭以养德\n非志无以成学（立志）→ 学须静 才须学\n淫慢险躁 → 枯落（反面）',
    opening: '提问：如果你要写一封信给十年后的自己，会叮嘱什么？诸葛亮临终前写给8岁儿子的家书说了什么？',
    reflection: '预设：学生对"志与学"关系理解不清 → 应对：用"目标-行动-能力"类比讲解。',
  },
  '狼（蒲松龄）': {
    genre: '文言文·小说', author: '蒲松龄',
    theme: '对贪婪狡诈之狼的嘲讽，赞颂屠户的机智勇敢',
    technique: '层层推进、动作描写、结尾议论',
    questions: ['屠户的"智"和"勇"分别体现在哪些地方？', '两只狼为什么"止增笑耳"？', '结尾"禽兽之变诈几何哉"有什么深意？'],
    keyPoints: ['梳理故事情节，分析屠户与狼的形象', '理解"止增笑耳"的议论'],
    difficulties: ['理解文章借狼说理的讽刺意味'],
    board: '狼\n遇狼→惧狼→御狼→杀狼\n屠：惧→窘→御→毙  狼：缀行→诱敌→毙命\n启示：对恶势力不可妥协，须智斗',
    opening: '提问：你听过哪些关于狼的故事？狼的形象通常是怎样的？引出蒲松龄笔下"狡猾"的狼。',
    reflection: '预设：学生易把重点放在"杀狼"的惊险而忽略"说理" → 应对：结尾议论句重点讲读。',
  },
  '观沧海（曹操）': {
    genre: '诗歌', author: '曹操',
    theme: '登高望海的壮阔，抒发建功立业的抱负',
    technique: '虚实结合、想象夸张、借景抒情',
    questions: ['哪些诗句写实景？哪些写想象之景？', '"日月之行，若出其中"的深意是什么？', '诗中表现曹操怎样的胸襟？'],
    keyPoints: ['理解诗歌内容，把握"壮阔"之景', '体会诗人豪迈的抱负'],
    difficulties: ['理解虚实结合的写法与"吞吐日月"的想象'],
    board: '观沧海\n实：水何澹澹 山岛竦峙 树木丛生 百草丰茂\n虚：日月之行 星汉灿烂\n情：统一天下的壮志',
    opening: '提问：登上高山之巅望海，你会想到什么？曹操北征乌桓凯旋时观海，写下这首诗。',
    reflection: '预设：学生分不清虚实 → 应对：标注诗句，讨论"日月"能否真从海中升起。',
  },
  '次北固山下（王湾）': {
    genre: '诗歌', author: '王湾',
    theme: '旅途思乡，以及"新旧交替"的哲理',
    technique: '情景交融、对仗工整、炼字',
    questions: ['"海日生残夜，江春入旧年"蕴含什么哲理？', '哪些诗句直接表达思乡之情？', '为什么说这首诗"情景交融"？'],
    keyPoints: ['理解诗句内容，体会思乡之情', '品味"生""入"两个动词的妙处'],
    difficulties: ['理解"海日生残夜"的哲理内涵'],
    board: '次北固山下\n客路青山外 行舟绿水前（旅途）\n潮平两岸阔 风正一帆悬（壮景）\n海日生残夜 江春入旧年（哲理）\n乡书何处达 归雁洛阳边（思乡）',
    opening: '提问：你离家远行时最想念什么？古代游子如何寄信回家？引出"乡书何处达"。',
    reflection: '预设：学生对哲理句理解困难 → 应对：结合"新事物必然取代旧事物"的生活例子讲解。',
  },
  '木兰诗': {
    genre: '乐府民歌', author: '北朝民歌',
    theme: '木兰代父从军，巾帼不让须眉的传奇',
    technique: '详略得当、互文、铺排排比',
    questions: ['诗歌详写什么、略写什么？为什么这样安排？', '木兰的形象有哪些特点？', '文中的互文句你能找出并翻译吗？'],
    keyPoints: ['朗读背诵，把握节奏韵律', '分析木兰形象，理解详略安排'],
    difficulties: ['理解"互文"修辞并正确翻译相关诗句'],
    board: '木兰诗\n（详）代父从军：愿为市鞍马…万里赴戎机\n（略）征战：将军百战死 壮士十年归\n（详）归来：开我东阁门…对镜贴花黄\n（详）巾帼：同行十二年 不知木兰是女郎',
    opening: '播放豫剧《花木兰》片段或展示女将军形象，提问：你心中的英雄是什么样的？木兰是怎样的"英雄"？',
    reflection: '预设：学生难懂互文 → 应对：举例"开我东阁门，坐我西阁床"实为"开东阁门坐东阁床"示范。',
  },
  '阿长与《山海经》（鲁迅）': {
    genre: '散文', author: '鲁迅',
    theme: '长妈妈的善良质朴，以及对底层劳动妇女的深情',
    technique: '欲扬先抑、白描、细节',
    questions: ['文章先写长妈妈哪些"讨厌"？后写哪些"可敬"？', '为什么"我"对《山海经》的渴望如此强烈？', '长妈妈买来《山海经》在"我"心中意味着什么？'],
    keyPoints: ['体会"欲扬先抑"的写法', '理解长妈妈的形象与作者的情感'],
    difficulties: ['理解"伟大的神力"的深层含义'],
    board: '阿长与《山海经》\n抑：切切察察 睡相 规矩多 谋害隐鼠\n扬：买《山海经》（别人不肯做/不能做的事）\n情：深沉的怀念与敬意',
    opening: '提问：你有没有一位"记忆深处的普通人"？鲁迅笔下这位保姆长妈妈，为何让他一生怀念？',
    reflection: '预设：学生不理解"抑"的部分为何要写 → 应对：引导思考"欲扬先抑"的对比效果。',
  },
  '老王（杨绛）': {
    genre: '散文', author: '杨绛',
    theme: '底层劳动者的善良，知识分子的"愧怍"',
    technique: '白描、对比、以小见大',
    questions: ['老王的"善"体现在哪些事上？', '作者为什么对老王"愧怍"？', '结尾"那是一个幸运的人对一个不幸者的愧怍"如何理解？'],
    keyPoints: ['把握老王形象，理解"愧怍"', '体会平淡叙述中的深情'],
    difficulties: ['理解作者"愧怍"的心理内涵'],
    board: '老王\n老王：三轮车夫 单干户 失群落伍 病危仍送香油鸡蛋\n"我"：给予帮助 但"不知怎的"愧怍\n幸运者 ↔ 不幸者：平等与尊重',
    opening: '提问：什么是"善良"？当善良的回报来得太迟时，我们心里会留下什么？引出杨绛的"愧怍"。',
    reflection: '预设：学生把"愧怍"理解为简单自责 → 应对：引导从"我"对老王是否真正平等尊重的角度思考。',
  },
  '陋室铭（刘禹锡）': {
    genre: '文言文', author: '刘禹锡',
    theme: '安贫乐道、高洁傲岸的君子之志',
    technique: '托物言志、类比、骈散结合',
    questions: ['陋室"陋"还是"不陋"？从哪些句子看出？', '文中用了哪些类比？各有何用意？', '作者借陋室表达怎样的志向？'],
    keyPoints: ['疏通文意，朗读背诵', '理解"托物言志"的写法'],
    difficulties: ['理解类比（山-仙、水-龙、南阳诸葛庐-西蜀子云亭）的作用'],
    board: '陋室铭\n陋室（物）→ 德馨（志）\n环境清幽 交往不俗 生活高雅\n类比：南阳诸葛庐 西蜀子云亭\n君子：安贫乐道 高洁傲岸',
    opening: '提问：如果你住在简陋的房子里，会怎么想？刘禹锡被贬仍写下"何陋之有"，这是怎样的境界？',
    reflection: '预设：学生对"托物言志"理解模糊 → 应对：对比"陋室"与"志"的关系，点明物是载体、志是核心。',
  },
  '爱莲说（周敦颐）': {
    genre: '文言文', author: '周敦颐',
    theme: '洁身自好、不与世俗同流合污的君子品格',
    technique: '托物言志、衬托（菊花正衬、牡丹反衬）',
    questions: ['莲有哪些可贵的品质？', '为什么要写菊花和牡丹？', '作者"独爱莲"表达了怎样的处世态度？'],
    keyPoints: ['理解莲的形象与君子的对应关系', '学习衬托的写法'],
    difficulties: ['理解三种花分别象征的三类人'],
    board: '爱莲说\n菊（隐逸者）→ 正衬 → 莲（君子）← 反衬 ← 牡丹（富贵者）\n莲：出淤泥而不染 濯清涟而不妖 中通外直 不蔓不枝',
    opening: '提问：古人常以物喻人，梅花喻高洁、竹子喻虚心。莲又喻什么？周敦颐为何"独爱莲"？',
    reflection: '预设：学生易混淆衬托与对比 → 应对：明确"衬托"有主次，莲是主角。',
  },
  '河中石兽（纪昀）': {
    genre: '文言文', author: '纪昀',
    theme: '实践出真知，不可主观臆断',
    technique: '层层推进、对比说理、结局反转',
    questions: ['三种找石兽的方法各是什么？为什么前两种都错了？', '老河兵的判断依据是什么？', '本文给我们什么启示？'],
    keyPoints: ['疏通文意，理解故事内容', '理解"然则天下之事"的说理'],
    difficulties: ['理解水流冲石的科学原理与"臆断"的批判'],
    board: '河中石兽\n僧：求之下流（错）\n讲学家：求之地中（错，据理臆断）\n老河兵：求之上流（对，实践）\n启示：实践出真知 不可臆断',
    opening: '提问：河边庙里的石兽被冲走了，到哪里找？三位"专家"各有说法，谁对谁错？引出纪昀的推理故事。',
    reflection: '预设：学生对物理原理理解有困难 → 应对：用沙盘/动画演示水流冲石过程。',
  },
  '皇帝的新装（安徒生）': {
    genre: '童话', author: '安徒生',
    theme: '揭露虚伪与愚昧，赞颂童真的诚实',
    technique: '夸张、想象、对比',
    questions: ['大臣们为什么不敢说真话？', '为什么只有孩子说出了真相？', '皇帝最后"摆出一副更骄傲的神气"说明了什么？'],
    keyPoints: ['梳理故事情节，分析人物心理', '理解童话的讽刺与童真的可贵'],
    difficulties: ['理解"新装"的象征意义与童话的现实意义'],
    board: '皇帝的新装\n皇帝：爱新装→被骗→游行（虚荣）\n大臣/百姓：不敢说真话（从众）\n孩子：他什么也没穿！（诚实）\n讽刺：虚伪与愚昧',
    opening: '提问：如果所有人都说一件假话，你敢说真话吗？安徒生用一个"看不见的皇帝新装"讲了这个道理。',
    reflection: '预设：学生只当故事看 → 应对：引导联系生活，理解"从众心理"。',
  },
  '天上的街市（郭沫若）': {
    genre: '诗歌', author: '郭沫若',
    theme: '对美好自由生活的向往，对现实黑暗的否定',
    technique: '联想与想象、节奏优美',
    questions: ['诗人由街灯联想到什么？', '诗人对牛郎织女故事的改写有什么用意？', '诗中"定然"一词表达了什么？'],
    keyPoints: ['理解联想与想象的区别', '体会诗人对光明理想的向往'],
    difficulties: ['理解改写牛郎织女故事的深意'],
    board: '天上的街市\n街灯→明星→街市（联想）\n街市：世上没有的珍奇\n牛郎织女：闲游（改写，美满）\n情：向往美好 否定黑暗',
    opening: '夜晚仰望星空，你会想到什么？郭沫若把星空想象成"天上的街市"，那里有什么？',
    reflection: '预设：学生混淆联想与想象 → 应对：举例辨析"由A想到B"（联想）与"创造出现实没有的B"（想象）。',
  },
};

// 体裁 fallback 模板生成器（课文不在知识库时按体裁给出写实教案）
interface GenreFallback {
  keyPoints?: string[];
  difficulties?: string[];
  questions?: string[];
  boardDesign?: string;
  opening?: string;
  reflection?: string;
}

function genByGenre(lesson: string, genre: string): GenreFallback {
  const G: Record<string, GenreFallback> = {
    抒情散文: {
      keyPoints: [`品味《${lesson}》优美生动的语言，学习借景抒情、细节描写的方法`],
      difficulties: [`理解《${lesson}》中景物描写与作者情感的交融`],
      questions: [`《${lesson}》中作者描写了哪些景物/画面？`],
      boardDesign: `${lesson}\n景（描写对象）→ 情（作者情感）→ 理（深层感悟）\n写法：比喻·拟人·多感官`,
      opening: `由生活情境导入：请学生说说自己印象最深的一处风景，自然过渡到《${lesson}》中作者笔下的世界。`,
      reflection: `预设：学生对"情景交融"理解不深 → 应对：删除比喻句让学生对比体会表达效果。`,
    },
    叙事散文: {
      keyPoints: [`梳理《${lesson}》的叙事线索，学习通过细节表现人物/情感的方法`],
      difficulties: [`理解《${lesson}》中"小事见大"的深层含义`],
      questions: [`《${lesson}》写了哪几件事？这些事情与中心有什么关系？`],
      boardDesign: `${lesson}\n事（线索）→ 人（形象）→ 情（中心）\n细节：动作·语言·神态`,
      opening: `由学生生活导入：你有没有一件"看似平常却难以忘记"的小事？引出《${lesson}》中作者笔下的往事。`,
      reflection: `预设：学生关注情节忽略细节 → 应对：精读典型细节，追问"这个动作说明什么"。`,
    },
    文言文: {
      keyPoints: [`疏通《${lesson}》文意，积累重点文言词语`, `理解《${lesson}》的主要内容与作者观点`],
      difficulties: [`理解《${lesson}》中关键句的深层含义与现代启示`],
      questions: [`《${lesson}》讲了一件什么事/阐明了什么道理？`],
      boardDesign: `${lesson}\n文意（疏通）→ 内容（概括）→ 主旨（启示）\n积累：一词多义·通假·古今异义`,
      opening: `由故事/成语导入：讲述与课文相关的典故，激发学习兴趣，引入《${lesson}》。`,
      reflection: `预设：学生畏难文言翻译 → 应对：小组合作疏通，教师点拨疑难句。`,
    },
    诗歌: {
      keyPoints: [`有感情地朗读并背诵《${lesson}》`, `理解《${lesson}》的意象、意境与情感`],
      difficulties: [`理解《${lesson}》中关键诗句的深层含义`],
      questions: [`《${lesson}》描绘了怎样的画面？表达了诗人怎样的情感？`],
      boardDesign: `${lesson}\n景（意象）→ 境（画面）→ 情（情感）\n手法：借景抒情·想象·炼字`,
      opening: `由配乐朗诵/图片导入，营造诗境，引出《${lesson}》的朗读与品析。`,
      reflection: `预设：学生只背不品 → 应对：设计"你从哪个字读到情感"的品字练习。`,
    },
    童话: {
      keyPoints: [`梳理《${lesson}》的情节，把握人物形象`, `理解童话的夸张手法与寓意`],
      difficulties: [`理解《${lesson}》的象征意义与现实启示`],
      questions: [`《${lesson}》中哪些情节最夸张？作者想借此讽刺/赞美什么？`],
      boardDesign: `${lesson}\n情节（起因→发展→高潮→结局）\n夸张之处 → 寓意\n启示：联系现实生活`,
      opening: `由"如果…会怎样"的想象游戏导入，引出《${lesson}》的童话世界。`,
      reflection: `预设：学生当故事听 → 应对：联系生活情境，讨论"文中角色像生活中的谁"。`,
    },
    说明文: {
      keyPoints: [`理清《${lesson}》的说明顺序，学习说明方法`, `理解《${lesson}》说明对象的特征`],
      difficulties: [`辨别《${lesson}》中的说明方法并分析其作用`],
      questions: [`《${lesson}》介绍了什么？作者按什么顺序介绍的？`],
      boardDesign: `${lesson}\n对象（特征）→ 顺序（时间/空间/逻辑）→ 方法（列数字·举例子·打比方）`,
      opening: `由实物/图片导入，引发对《${lesson}》介绍对象的好奇。`,
      reflection: `预设：学生混淆说明方法 → 应对：每种方法配典型例句当堂训练。`,
    },
  };
  return G[genre] ?? G['抒情散文'];
}

function detectGenre(lesson: string): string {
  if (/(诗|歌|乐府)/.test(lesson)) return '诗歌';
  if (/(文言|论|说|铭|赋|表|传|诫)/.test(lesson)) return '文言文';
  if (/(童话|寓言)/.test(lesson)) return '童话';
  if (/(说明|介绍|科学)/.test(lesson)) return '说明文';
  if (/(记|忆|事|人|散步|怀念)/.test(lesson)) return '叙事散文';
  return '抒情散文';
}

// ---------- 本地教案生成（不依赖 AI，直接产出"可上课"的完整教案） ----------
export function buildTemplateLesson(
  lesson: string,
  grade: string,
  textbook: string,
  style = '启发探究型'
): LessonPlanContent {
  const note = LESSON_NOTES[lesson];
  const genre = note?.genre ?? detectGenre(lesson);
  const g = genByGenre(lesson, genre);
  const author = note ? `（${note.author}）` : '';
  const theme = note?.theme ?? `理解《${lesson}》的主要内容，体会作者的思想感情`;
  const technique = note?.technique ?? '品味语言，学习表达方法';
  const questions = note?.questions ?? g.questions ?? [];
  const keyPoints = note?.keyPoints ?? g.keyPoints ?? [];
  const difficulties = note?.difficulties ?? g.difficulties ?? [];
  const board = note?.board ?? g.boardDesign ?? '';
  const opening = note?.opening ?? g.opening ?? '';
  const reflection = note?.reflection ?? g.reflection ?? '';

  const evaluation = [
    '你读得真有感情，把作者的心情都读出来了，老师仿佛身临其境。',
    '这个发现太精彩了！你是从哪个词读出来的？能和大家说说吗？',
    '你的想象真丰富，比老师想的还生动。',
    '能联系自己的生活来理解课文，这就是会读书的表现。',
    '你的朗读节奏把握得很好，重音落在"……"上就更好了。',
    '这个小组讨论很热烈，分工明确，值得表扬。',
    '你圈画的句子选得真好，一针见血。',
    '虽然答得不完全对，但你敢举手，就是最大的进步。',
    '你的回答让我看到了你对文字的敏感，继续保持。',
    '说得好！这个问题的答案不是唯一的，你给了我们新的角度。',
    '你最近进步很大，朗读更自信了。',
    '大家一起把掌声送给他！',
  ].join('；');

  return {
    meta: { grade, textbook, lesson, period: '第一课时', duration: '45分钟', style },
    goals: [
      { dimension: '语言建构与运用', content: `正确读写本课生字词，有感情地朗读《${lesson}》，积累精彩语句，学习${technique}。` },
      { dimension: '思维发展与提升', content: `通过圈点批注、问题探究，深入理解《${lesson}》的内容结构，能提出并解答核心问题。` },
      { dimension: '审美鉴赏与创造', content: `品味《${lesson}》的语言之美，体会${theme}，并尝试用所学方法进行片段仿写。` },
      { dimension: '文化传承与理解', content: `了解作者${author}及其创作背景，感受中华语言文字的魅力，增强文化自信。` },
    ],
    keyPoints,
    difficulties,
    questions,
    prep: {
      teacher: `多媒体课件（含《${lesson}》朗读音频/相关图片视频）、生字词卡片、学习单`,
      student: `预习《${lesson}》，标注生字词；了解作者${author || '及写作背景'}；尝试朗读课文一遍`,
    },
    process: [
      {
        step: '情境导入',
        duration: '5分钟',
        teacherActivity: `${opening} 出示课题《${lesson}》，板书课题，简要介绍作者${author || ''}及文体特点。`,
        studentActivity: '观察、思考、自由发言；齐读课题，明确学习目标。',
        intent: '创设情境，激发兴趣，自然引入课文；交代目标，让学生带着任务学习。',
      },
      {
        step: '初读感知',
        duration: '8分钟',
        teacherActivity: '范读或播放朗读音频；出示朗读要求：读准字音、读通句子、读出节奏；检查预习字词，正音释义；提问：课文主要写了什么？',
        studentActivity: '自由朗读课文，圈画生字词；认读字词；用一句话概括课文内容，同桌互说。',
        intent: '整体感知，扫清字词障碍，为精读打基础；训练概括能力。',
      },
      {
        step: '精读品味',
        duration: '12分钟',
        teacherActivity: `围绕核心问题（${questions[0] ?? `《${lesson}》哪些语句最精彩？`}）引导学生默读圈画；组织交流，点拨赏析语言（重点语句的修辞、用词、情感）。`,
        studentActivity: '默读圈画关键语句，批注感受；在小组内交流，代表发言；朗读品味精彩语段。',
        intent: '深入文本，品味语言，落实"语言建构与审美鉴赏"目标；培养圈点批注习惯。',
      },
      {
        step: '研读探究',
        duration: '8分钟',
        teacherActivity: `出示探究问题（${questions.slice(1).join('；') || '本文的主旨是什么？作者想告诉我们什么？'}），组织小组合作探究；巡视指导，追问点拨，引导学生联系生活理解${theme}。`,
        studentActivity: '小组讨论，梳理观点；汇报交流，倾听补充；联系自身经验谈体会。',
        intent: '突破难点，深化理解，发展思维；体现学生主体与合作学习。',
      },
      {
        step: '拓展延伸',
        duration: '7分钟',
        teacherActivity: `提供拓展材料或话题（仿照课文写法写一段话 / 比较阅读同类作品 / 联系生活谈启示），示范一例，组织展示。`,
        studentActivity: '选择一项任务，当堂小练笔或口头表达；展示交流，互相评价。',
        intent: '迁移运用，读写结合，巩固写法；实现由"学"到"用"。',
      },
      {
        step: '课堂小结',
        duration: '5分钟',
        teacherActivity: '引导学生回顾：本课学会了什么？从内容、写法、情感三个角度小结；布置分层作业。',
        studentActivity: '自主梳理本课收获，尝试用一句话总结；记录作业。',
        intent: '回扣目标，构建知识结构；让学生学会自我总结。',
      },
    ],
    boardDesign: board,
    homework: {
      base: `1. 抄写并积累本课生字词（每个 2 遍），注意字形字音。2. 有感情地朗读《${lesson}》，背诵要求背诵的段落/诗句。3. 完成课后练习题中的基础题。`,
      extended: `1.（选做）仿照《${lesson}》的写法，写一段 150 字左右的片段（写景/叙事/抒情均可）。2.（选做）阅读作者${author || '同类作品'}的另一篇作品，写 50 字阅读感受。3.（选做）把《${lesson}》讲给家人听，并交流体会。`,
    },
    standards: [
      '《义务教育语文课程标准（2022年版）》："阅读教学应引导学生钻研文本，在主动积极的思维和情感活动中，加深理解和体验，有所感悟和思考。"',
      '本课教学落实语文核心素养中"语言的建构与运用、审美的鉴赏与创造"，注重朗读、品味、积累与迁移。',
    ],
    reflection,
    interaction: {
      opening: `①（情境导入）${opening}\n②（问题导入）提问：看到课题《${lesson}》你想知道什么？把学生的问题归类为课堂探究的方向。\n③（背景导入）介绍作者${author || '及创作背景'}，引出课文。`,
      dialogues: `围绕核心问题展开的师生对话预设：\n师：${questions[0] ?? '课文中最打动你的地方是哪里？'}\n生1（优秀）：……（引导从用词、修辞、情感角度肯定并深化）\n师：你抓住了"……"这个词，能具体说说它的妙处吗？\n生2（一般）：……（点拨：再读一读，注意这些语句之间的联系）\n生3（偏差）：……（不否定，引导回到文本找依据）\n小结语：同学们都能从文本中找依据，这就是"言之有据"的阅读。`,
      evaluation,
    },
  };
}

// ---------- AI 生成教案（两阶段：课文深度解读 → 教案，OpenAI 兼容接口） ----------
export async function aiGenerateLesson(
  lesson: string,
  grade: string,
  textbook: string,
  outlineText: string,
  standardText: string,
  style = '启发探究型'
): Promise<LessonPlanContent> {
  const context = [
    outlineText ? `【教学大纲】\n${outlineText}` : '',
    standardText ? `【课程标准】\n${standardText}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const SYSTEM = `你是一位资深中小学语文教学专家，拥有20年教学经验，精通统编版语文教材和《义务教育语文课程标准（2022年版）》。
当前学段：${grade}；教学风格：${style}。所有回答紧扣新课标语文核心素养，内容专业、可直接用于教学，用中文输出。`;

  // 阶段一：课文深度解读（为教案提供专业依据）
  const analysisPrompt = `请对统编版语文教材${grade}的课文《${lesson}》进行专业深度解读（只解读，不写教案）：
一、课文定位与编排意图：本课在单元中的位置作用、对应语文要素与人文主题、新课标学段要求
二、文本深度解读：体裁与写作特点、主题思想与情感内涵、语言特色与表达技巧、结构层次分析
三、知识点梳理：重点字词（字音字形词义）、语法修辞、文学常识与文化知识、阅读方法指导
四、重难点分析：教学重点2-3条、难点1-2条、突破难点的教学策略
五、教学切入点：导入设计思路、2-3个核心主问题、课堂活动建议、拓展延伸方向`;
  const analysis = await aiGenerate(analysisPrompt, SYSTEM);

  // 阶段二：基于解读生成完整教案（结构化 JSON）
  const planPrompt = `请为统编版语文教材${grade}的课文《${lesson}》生成一份标准教案（教学风格：${style}，${grade}学生认知水平）。
${context ? context + '\n' : ''}
【课文深度解读参考】\n${analysis}

教案结构（JSON）：
1. meta：grade/textbook/lesson/period(第一课时)/duration(45分钟)/style
2. goals：新课标核心素养四维（语言建构与运用/思维发展与提升/审美鉴赏与创造/文化传承与理解），每条结合课文具体可测，真实可评估
3. keyPoints：教学重点 1-2 条，具体到该课文的语文要素
4. difficulties：教学难点 1-2 条
5. questions：2-3 个核心主问题（能统领课堂探究的优质问题）
6. prep：teacher（教师准备：课件/教具/资料）、student（学生预习要求）
7. process：6 个环节（情境导入/初读感知/精读品味/研读探究/拓展延伸/课堂小结），每环节含 duration、teacherActivity（含具体提问与引导语）、studentActivity（朗读/圈点批注/小组合作等）、intent（设计意图）；时间分配合理合计约 45 分钟；导入要真实生动、贴合${style}风格
8. boardDesign：板书结构图（文本层级表示，含课题与核心内容）
9. homework：base（基础必做，积累+理解）、extended（拓展选做，阅读/写作迁移）
10. standards：1-2 条对应课程标准表述
11. reflection：教学反思预设——可能出现的问题（如难点理解不到位、课堂冷场）及应对策略
12. interaction：opening（2-3 种导入话术，标注适用场景）、dialogues（3-5 组核心师生对话：教师引导语/预设学生回答（含优秀/一般/偏差）/教师点评语）、evaluation（10 条以上鼓励性评价语，适配不同场景）

JSON 格式要求（非常重要）：所有字符串值必须是单行，内部不要换行（用标点断句）；数组元素之间用英文逗号；字段名英文双引号。只输出合法 JSON，不要输出任何其他文字。
格式：
{"meta":{"grade":"...","textbook":"...","lesson":"...","period":"第一课时","duration":"45分钟","style":"..."},"goals":[{"dimension":"...","content":"..."}],"keyPoints":["..."],"difficulties":["..."],"questions":["..."],"prep":{"teacher":"...","student":"..."},"process":[{"step":"...","duration":"...","teacherActivity":"...","studentActivity":"...","intent":"..."}],"boardDesign":"...","homework":{"base":"...","extended":"..."},"standards":["..."],"reflection":"...","interaction":{"opening":"...","dialogues":"...","evaluation":"..."}}`;

  const raw = await aiGenerate(planPrompt, SYSTEM);
  // 提取 JSON（容错：截取第一个 { 到最后一个 }）
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI 返回内容不是有效的 JSON');
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice) as LessonPlanContent;
  } catch {
    // 容错：把字符串字面量内的裸换行转义为 \n 后再解析
    const repaired = repairJsonStrings(slice);
    return JSON.parse(repaired) as LessonPlanContent;
  }
}

// 将 JSON 字符串值中的裸换行转义（AI 常在字段内容里直接换行导致 JSON 非法）
function repairJsonStrings(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (ch === '\n' && inStr) {
      out += '\\n';
      continue;
    }
    out += ch;
  }
  return out;
}

export function hasAi() {
  return hasAiConfig();
}

// ---------- 一键生成课堂教学 PPT（pptxgenjs 本地打包） ----------
// 面向课堂投影：学生看到的是学习目标、核心问题、各环节任务与作业；
// 教师活动与设计意图写入每页演讲者备注，不投影。
export async function generatePptx(content: LessonPlanContent): Promise<void> {
  const mod: any = await import('pptxgenjs');
  const PptxGenJS = mod.default ?? mod;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const FONT = '微软雅黑';
  const TEAL = '2E8B87';
  const DARK = '1F2937';
  const GRAY = '64748B';
  const bg = { color: 'FFFFFF' };
  const accent = (slide: any, y = 0.0) =>
    slide.addShape('rect', { x: 0, y, w: 13.33, h: 0.12, fill: { color: TEAL } });
  const head = (slide: any, t: string) => {
    slide.addText(t, { x: 0.6, y: 0.35, w: 12, h: 0.7, fontSize: 28, bold: true, color: DARK, fontFace: FONT });
    slide.addShape('rect', { x: 0.62, y: 1.05, w: 0.9, h: 0.07, fill: { color: TEAL } });
  };
  // 学生活动拆成任务条目（学生一看就知道要做什么）
  const bullets = (s: string) =>
    s
      .split(/；|。/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => '· ' + x)
      .join('\n');

  // 1 封面
  const s1 = pptx.addSlide();
  s1.background = bg;
  accent(s1, 7.38);
  s1.addText('《' + content.meta.lesson + '》', { x: 1, y: 2.2, w: 11.3, h: 1.2, fontSize: 44, bold: true, color: DARK, align: 'center', fontFace: FONT });
  s1.addText('初中语文 · 课堂教学', { x: 1, y: 3.6, w: 11.3, h: 0.7, fontSize: 22, color: TEAL, align: 'center', fontFace: FONT });
  s1.addText(`${content.meta.textbook} · ${content.meta.grade} · ${content.meta.period}（${content.meta.duration}）`, {
    x: 1, y: 4.4, w: 11.3, h: 0.6, fontSize: 14, color: GRAY, align: 'center', fontFace: FONT,
  });

  // 2 学习目标
  const s2 = pptx.addSlide();
  s2.background = bg;
  head(s2, '学习目标');
  s2.addText(content.goals.map((g) => `${g.dimension}：${g.content}`).join('\n'), {
    x: 0.8, y: 1.5, w: 11.7, h: 5.2, fontSize: 20, color: '374151', lineSpacingMultiple: 1.6, fontFace: FONT,
  });

  // 3 核心问题（统领课堂探究）
  const qs = content.questions.filter((q) => q);
  if (qs.length > 0) {
    const s3 = pptx.addSlide();
    s3.background = bg;
    head(s3, '课堂主问题');
    s3.addText(qs.map((q, i) => `${i + 1}. ${q}`).join('\n'), {
      x: 0.8, y: 1.6, w: 11.7, h: 5, fontSize: 24, bold: true, color: DARK, lineSpacingMultiple: 1.8, fontFace: FONT,
    });
  }

  // 4 教学过程（每环节一页：学生任务上屏；教师活动/设计意图进演讲者备注）
  for (const step of content.process) {
    const s = pptx.addSlide();
    s.background = bg;
    head(s, `${step.step}（${step.duration}）`);
    s.addText(bullets(step.studentActivity) || '完成课堂活动', {
      x: 0.8, y: 1.5, w: 11.7, h: 5.3, fontSize: 22, color: '374151', lineSpacingMultiple: 1.6, fontFace: FONT,
    });
    s.addNotes(`教师活动：${step.teacherActivity}\n设计意图：${step.intent}`);
  }

  // 5 课堂小结（板书设计）
  const sB = pptx.addSlide();
  sB.background = bg;
  head(sB, '课堂小结');
  sB.addText(content.boardDesign || '回顾本课所学，梳理收获', {
    x: 0.8, y: 1.5, w: 11.7, h: 5.3, fontSize: 20, color: '374151', lineSpacingMultiple: 1.6, fontFace: FONT,
  });

  // 6 作业布置
  const sH = pptx.addSlide();
  sH.background = bg;
  head(sH, '作业布置');
  sH.addText(['【基础作业】', content.homework.base, '', '【拓展作业】', content.homework.extended].join('\n'), {
    x: 0.8, y: 1.5, w: 11.7, h: 5.3, fontSize: 20, color: '374151', lineSpacingMultiple: 1.6, fontFace: FONT,
  });

  // 尾页
  const sE = pptx.addSlide();
  sE.background = bg;
  accent(sE, 0);
  sE.addText('下节课见', { x: 1, y: 3, w: 11.3, h: 1, fontSize: 40, bold: true, color: TEAL, align: 'center', fontFace: FONT });
  sE.addText(`《${content.meta.lesson}》`, { x: 1, y: 4.2, w: 11.3, h: 0.6, fontSize: 16, color: GRAY, align: 'center', fontFace: FONT });

  await pptx.writeFile({ fileName: `课堂PPT-${content.meta.lesson}.pptx` });
}

// 保存/读取设置
export async function saveLessonSettings(settings: LessonSettings) {
  const sb = (await import('@/lib/supabase')).getSupabase();
  await sb.from('lesson_settings').upsert(settings, { onConflict: 'owner_id' });
}
