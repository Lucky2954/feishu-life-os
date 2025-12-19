const axios = require('axios');

// 从环境变量获取密钥 (部署时设置)
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const APP_TOKEN = process.env.FEISHU_APP_TOKEN; // Base ID
const TABLE_ID = process.env.FEISHU_TABLE_ID;

// 1. 获取 tenant_access_token (飞书的“入场券”)
async function getToken() {
    const url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    const res = await axios.post(url, { app_id: APP_ID, app_secret: APP_SECRET });
    return res.data.tenant_access_token;
}

// 主处理函数
module.exports = async (req, res) => {
    try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const action = req.query.action || req.body.action;

        // --- 功能 A: 检查是否有进行中的任务 ---
        if (action === 'check') {
            const searchUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?filter=CurrentValue.[状态]="进行中"`;
            const { data } = await axios.get(searchUrl, { headers });
            
            if (data.data.items && data.data.items.length > 0) {
                // 找到了进行中的任务
                const item = data.data.items[0];
                return res.json({
                    hasActive: true,
                    recordId: item.record_id,
                    info: `${item.fields['一级分类']} - ${item.fields['任务名称']}`
                });
            } else {
                return res.json({ hasActive: false });
            }
        }

        // --- 功能 B: 开始新任务 ---
        if (action === 'start') {
            const { mainCat, subCat, detail } = req.body;
            const addUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;
            
            await axios.post(addUrl, {
                fields: {
                    "一级分类": mainCat,
                    "二级分类": subCat, // 如果是新词，飞书会自动添加选项（需开启表格的“允许新增选项”）
                    "任务名称": detail,
                    "状态": "进行中",
                    "开始时间": new Date().getTime()
                }
            }, { headers });
            
            return res.json({ success: true });
        }

        // --- 功能 C: 完成任务 ---
        if (action === 'finish') {
            const { recordId } = req.body;
            const updateUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
            
            await axios.put(updateUrl, {
                fields: {
                    "状态": "已完成",
                    "结束时间": new Date().getTime()
                }
            }, { headers });
            
            return res.json({ success: true });
        }

        res.status(400).json({ error: "Invalid action" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};