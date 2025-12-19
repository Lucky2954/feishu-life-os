const axios = require('axios');

// 环境变量
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const APP_TOKEN = process.env.FEISHU_APP_TOKEN; // Base ID
const TABLE_ID = process.env.FEISHU_TABLE_ID;

// 1. 获取 tenant_access_token
async function getToken() {
    const url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    try {
        const res = await axios.post(url, { app_id: APP_ID, app_secret: APP_SECRET });
        return res.data.tenant_access_token;
    } catch (e) {
        console.error("获取 Token 失败:", e.response?.data || e.message);
        throw new Error("Feishu Auth Failed");
    }
}

// 主处理函数
module.exports = async (req, res) => {
    try {
        // --- 🟢 修复开始：更安全的 Action 获取逻辑 ---
        let action = null;

        // 1. 先尝试从 URL 参数获取 (例如 ?action=check)
        if (req.query && req.query.action) {
            action = req.query.action;
        } 
        // 2. 如果没有，再尝试从请求体获取 (例如 POST body)
        // 关键修复：使用了 ?. (可选链) 防止报错，或者检查 req.body 是否存在
        else if (req.body && req.body.action) {
            action = req.body.action;
        }
        
        // 3. 如果还是没有，且是 GET 请求，默认为 'check' (检查状态)
        if (!action && req.method === 'GET') {
            action = 'check';
        }
        // --- 🔴 修复结束 ---

        if (!action) {
            return res.status(400).json({ error: "No action specified" });
        }

        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };

        // --- 功能 A: 检查是否有进行中的任务 ---
        if (action === 'check') {
            // 注意：这里过滤条件里的 [状态] 需要和你飞书里的字段名一模一样
            const searchUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?filter=CurrentValue.[状态]="进行中"`;
            
            const { data } = await axios.get(searchUrl, { headers });
            
            if (data.data && data.data.items && data.data.items.length > 0) {
                const item = data.data.items[0];
                return res.json({
                    hasActive: true,
                    recordId: item.record_id,
                    // 确保这里的字段名 '一级分类' 和 '任务名称' 与飞书一致
                    info: `${item.fields['一级分类'] || '未知'} - ${item.fields['任务名称'] || '无标题'}`
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
                    "二级分类": subCat,
                    "任务名称": detail,
                    "状态": "进行中",
                    "开始时间": new Date().getTime() // 飞书支持毫秒级时间戳
                }
            }, { headers });
            
            return res.json({ success: true });
        }

        // --- 功能 C: 完成任务 ---
        if (action === 'finish') {
            const { recordId } = req.body;
            if (!recordId) return res.status(400).json({ error: "Missing recordId" });

            const updateUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
            
            await axios.put(updateUrl, {
                fields: {
                    "状态": "已完成",
                    "结束时间": new Date().getTime()
                }
            }, { headers });
            
            return res.json({ success: true });
        }

        return res.status(400).json({ error: "Unknown action" });

    } catch (error) {
        console.error("Server Error:", error.response?.data || error.message);
        // 返回详细错误信息给前端，方便调试
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error.response?.data || error.message 
        });
    }
};