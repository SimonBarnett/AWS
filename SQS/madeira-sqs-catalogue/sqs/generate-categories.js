// add a football memorabilia category  
// ====================== sqs/generate-categories.js ======================
// Generates / updates discount categories using Grok (structured output)
// Strong, authoritative prompt with permanent exclusion enforcement
// User instructions come from json_chat (last prompt)
// Reads json_categories + json_exclude directly from the joined record
// Interactive and Unattended message components are fully separated into functions
// Sends previous chat turns (index 1 to current-1) as history to Grok
// All database writes (categories, chat, exclusions) combined into one MERGE
// Last updated: 18 June 2026

const {
    logger,
    enqueueMessage,
    sql
} = require('/opt/nodejs/helpers');

const { callGrokStructured } = require('/opt/nodejs/grok');
const { CATEGORY_SCHEMA } = require('../grok_schema');
const { withStatusHandling } = require('./helpers');

// ====================== HANDLER ======================
async function handle(event) {
    const { sandbox } = event;

    return withStatusHandling(event, async ({ pool, url }) => {

        const clubResult = await pool.request()
            .input('url', sql.NVarChar, url)
            .query(`
                SELECT 
                    CS.*, 
                    UC.json_categories,
                    UC.json_exclude,
                    UC.json_chat
                FROM clubscan CS 
                LEFT OUTER JOIN [dbo].[UserCategories] UC 
                    ON CS.ClubID = UC.uid
                WHERE CS.Url = @url
            `);

        const clubRecord = clubResult.recordset[0];
        if (!clubRecord) {
            throw new Error('Club record not found in clubscan');
        }

        const isOnboarding = !clubRecord.json_categories;

        const { categories, exclude: updatedExclusions, dialog } = await generateCategories(clubRecord, isOnboarding);

        // Build final chat array
        let chat = [];
        if (clubRecord.json_chat) {
            try {
                chat = JSON.parse(clubRecord.json_chat);
            } catch (e) {
                chat = [];
            }
        }
        if (!Array.isArray(chat)) chat = [];

        if (isOnboarding || chat.length === 0) {
            chat = [{
                prompt: "",
                dialog: dialog
            }];
        } else {
            const lastIndex = chat.length - 1;
            if (chat[lastIndex] && typeof chat[lastIndex] === 'object') {
                chat[lastIndex].dialog = dialog;
            }
        }

        const finalExclusions = (updatedExclusions && Array.isArray(updatedExclusions))
            ? updatedExclusions
            : null;

        // SINGLE MERGE
        await pool.request()
            .input('uid', sql.VarChar, clubRecord.ClubID)
            .input('json_categories', sql.NVarChar(sql.MAX), JSON.stringify(categories))
            .input('json_chat', sql.NVarChar(sql.MAX), JSON.stringify(chat))
            .input('json_exclude', sql.NVarChar(sql.MAX), finalExclusions ? JSON.stringify(finalExclusions) : null)
            .query(`
                MERGE INTO UserCategories AS target
                USING (SELECT @uid AS uid) AS source
                ON target.uid = source.uid
                WHEN MATCHED THEN 
                    UPDATE SET 
                        json_categories = @json_categories,
                        json_chat = @json_chat,
                        json_exclude = COALESCE(@json_exclude, target.json_exclude),
                        LastUpdate = GETDATE()
                WHEN NOT MATCHED THEN 
                    INSERT (uid, json_categories, json_chat, json_exclude, LastUpdate) 
                    VALUES (@uid, @json_categories, @json_chat, @json_exclude, GETDATE());
            `);

        logger.info('Categories, chat and exclusions updated', {
            userId: clubRecord.ClubID,
            url,
            isOnboarding
        });

        if (!sandbox) {
            await enqueueMessage({
                type: 'CLUBSCAN_BUILD_CATALOG',
                url,
                sandbox,
                enqueueNotify: isOnboarding
            });
        }

    }, {
        startStatus: 'generating_categories',
        successStatus: 'categories_complete'
    });
}

// ====================== PROMPT HELPER FUNCTIONS ======================

function buildModeInstruction({ isOnboarding }) {
    if (isOnboarding) {
        return `
This is the INITIAL / ONBOARDING generation.

You must return:
- A warm, professional welcome message.
- A short explanation of how you chose the categories based on the club’s audience and activities.
- A short, helpful list of example things the user can say next (e.g. "Add a category for...", "Remove the X category", "Move Y category higher", "Change the icon for Z", etc.).

Keep the tone friendly and helpful.`;
    } else {
        return `
This is an UPDATE to an existing catalogue.

Respond naturally to the user’s latest instruction.
In your response, clearly describe what changes you made (added, removed, reordered, or modified categories/subcategories).
Be concise but informative.`;
    }
}

function buildSystemPrompt({ isOnboarding, jsonExclude, userInstruction, chatHistory }) {
    const exclusionRule = jsonExclude.length > 0
        ? `\n\nPERMANENT EXCLUSION RULE (YOU MUST OBEY THIS):
The user has ALREADY DELETED these categories: ${JSON.stringify(jsonExclude)}

You MUST NOT re-create, suggest, or return ANY of these categories under any circumstances — even if the current website contains products that would normally belong to them.
If a product fits an excluded category, either skip it or map it to the most appropriate active (non-excluded) category.
This list is authoritative and permanent. Never override a user deletion unless the user specifically requests it in the current instruction.`
        : '';

    const modeInstruction = buildModeInstruction({ isOnboarding });

    const userInstructionBlock = userInstruction
        ? `\n\nLATEST USER INSTRUCTION:\n"${userInstruction}"`
        : '';

    let chatHistoryBlock = '';
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        chatHistoryBlock = `\n\nPREVIOUS CONVERSATION HISTORY (for context):\n`;
        chatHistory.forEach((entry) => {
            if (entry && typeof entry === 'object') {
                if (entry.prompt) chatHistoryBlock += `User: ${entry.prompt}\n`;
                if (entry.dialog) chatHistoryBlock += `Assistant: ${entry.dialog}\n`;
            }
        });
    }

    return `You are an expert UK affiliate marketing strategist for sports, leisure and community clubs.

CRITICAL RULES - FOLLOW THESE STRICTLY:

1. EVERY category MUST have a valid FREE FontAwesome icon (fa-solid, fa-regular or fa-brands only).

2. You must assign ordering based on relevance to the club's audience:
   - MainCategoryOrder: Rank each main category by relevance (1 = most relevant).
   - SubCategoryOrder: Within each category, rank subcategories by relevance (1 = most relevant).

3. Each category must follow this structure:

{
  "icon": "fa-solid fa-xxx",
  "MainCategoryOrder": 1,
  "subcategories": [ ... ]
}

4. Each subcategory must follow this structure:

{
  "name": "Subcategory Name",
  "SubCategoryOrder": 1,
  "searchTerms": [
    "*most*specific*3*word*term*",
    "*slightly*wider*term*",
    "*even*wider*term*",
    "*broad*term*",
    "*widest*term*"
  ],
  "meta": {
    "relevantKeywords": ["keyword1", "keyword2"],
    "irrelevantKeywords": ["avoid1", "avoid2"],
    "notes": "Short guidance on relevance"
  }
}

SEARCH TERMS RULES:
- Exactly 5 terms per subcategory.
- All terms MUST be in wildcard format (*word*word*).
- First term = most specific.

OTHER RULES:
- Focus ONLY on physical products.
- Subcategory names must be excellent search terms.

${modeInstruction}
${exclusionRule}
${userInstructionBlock}
${chatHistoryBlock}`;
}

function buildUserMessage({ isOnboarding, jsonCategories, context, userInstruction }) {
    if (isOnboarding) {
        return `Club Information:\n${JSON.stringify(context, null, 2)}\n\nGenerate the initial category list according to the rules above.`;
    } else {
        return `Current Catalogue (CANONICAL):\n${JSON.stringify(jsonCategories)}\n\n${userInstruction 
            ? `Apply the latest user instruction and describe the changes you made.` 
            : `Return the catalogue unchanged.`}`;
    }
}

// ====================== GENERATE CATEGORIES ======================
async function generateCategories(clubRecord, isOnboarding) {
    let jsonCategories = clubRecord.json_categories;
    let jsonExclude    = clubRecord.json_exclude;
    let jsonChat       = clubRecord.json_chat;

    logger.info('=== generateCategories ENTERED ===', {
        url: clubRecord.Url
    });

    if (typeof jsonCategories === 'string') {
        try { jsonCategories = JSON.parse(jsonCategories); } catch (e) { jsonCategories = null; }
    }
    if (typeof jsonCategories !== 'object' || jsonCategories === null) jsonCategories = null;

    if (typeof jsonExclude === 'string') {
        try { jsonExclude = JSON.parse(jsonExclude); } catch (e) { jsonExclude = []; }
    }
    if (!Array.isArray(jsonExclude)) jsonExclude = [];

    if (typeof jsonChat === 'string') {
        try { jsonChat = JSON.parse(jsonChat); } catch (e) { jsonChat = []; }
    }
    if (!Array.isArray(jsonChat)) jsonChat = [];

    logger.info('jsonChat after parse', {
        chatLength: jsonChat.length,
        rawChat: JSON.stringify(jsonChat)
    });

    // =====================================================
    // LOGGING + SAFE ACCESS AROUND THE SUSPECTED LINE
    // =====================================================
    let userInstruction = null;

    if (Array.isArray(jsonChat) && jsonChat.length > 0) {
        const lastEntry = jsonChat[jsonChat.length - 1];

        logger.info('Accessing lastEntry.prompt', {
            lastEntryExists: !!lastEntry,
            lastEntryType: typeof lastEntry,
            hasPrompt: lastEntry && typeof lastEntry.prompt === 'string'
        });

        if (lastEntry && typeof lastEntry === 'object' && typeof lastEntry.prompt === 'string') {
            userInstruction = lastEntry.prompt;
        } else {
            logger.warn('lastEntry has no valid prompt', {
                lastEntry: JSON.stringify(lastEntry)
            });
        }
    }

    // Safe chat history
    let chatHistory = [];
    if (Array.isArray(jsonChat) && jsonChat.length > 2) {
        chatHistory = jsonChat
            .slice(1, -1)
            .filter(entry => entry && typeof entry === 'object');
    }

    // Build context
    let parsed = {};
    if (clubRecord.JsonResult) {
        try { parsed = JSON.parse(clubRecord.JsonResult); } catch (e) {}
    }

    const context = {
        clubName: parsed.name || 'Unknown Club',
        url: clubRecord.Url,
        location: parsed.location || '',
        sector: parsed.sector || '',
        audience: parsed.audience || '',
        review: parsed.review || '',
        marketSegments: (parsed.marketSegments || []).map(m => ({
            segmentName: m.segmentName,
            description: m.description
        }))
    };

    const systemPrompt = buildSystemPrompt({
        isOnboarding,
        jsonExclude,
        userInstruction,
        chatHistory
    });

    const userMessage = buildUserMessage({
        isOnboarding,
        jsonCategories,
        context,
        userInstruction
    });

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];

    const result = await callGrokStructured(messages, CATEGORY_SCHEMA, {
        temperature: 0.3,
        max_tokens: 8000
    });

    if (!result?.categories || Object.keys(result.categories).length < 6) {
        throw new Error('Grok returned insufficient categories');
    }

    let finalExclusions = jsonExclude;
    if (result.exclude && Array.isArray(result.exclude)) {
        finalExclusions = [...new Set([...jsonExclude, ...result.exclude])];
    }

    return {
        categories: result.categories,
        exclude: finalExclusions,
        dialog: result.dialog || "Categories have been updated."
    };
}

module.exports = { handle };