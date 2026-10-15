"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JiraService = void 0;
exports.markdownToAdf = markdownToAdf;
function textNode(text) {
    return { type: 'text', text };
}
/**
 * Converts the lightweight markdown jcommit descriptions use (`## Heading`,
 * `- bullet`, paragraphs) into Atlassian Document Format so the Jira issue keeps
 * the same structure as the commit body and merge request.
 */
function markdownToAdf(markdown) {
    const nodes = [];
    let paragraph = [];
    let bullets = [];
    const flushParagraph = () => {
        if (paragraph.length) {
            // Keep line breaks (e.g. `Doc-Impact:` / `Doc-Area:` trailers) instead of reflowing.
            const content = paragraph.flatMap((line, index) => index ? [{ type: 'hardBreak' }, textNode(line)] : [textNode(line)]);
            nodes.push({ type: 'paragraph', content });
            paragraph = [];
        }
    };
    const flushBullets = () => {
        if (bullets.length) {
            nodes.push({ type: 'bulletList', content: bullets });
            bullets = [];
        }
    };
    for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trim();
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^[-*]\s+(.*)$/);
        if (!line) {
            flushParagraph();
            flushBullets();
        }
        else if (heading) {
            flushParagraph();
            flushBullets();
            nodes.push({
                type: 'heading',
                attrs: { level: Math.min(heading[1].length + 1, 6) },
                content: [textNode(heading[2])],
            });
        }
        else if (bullet) {
            flushParagraph();
            bullets.push({ type: 'listItem', content: [{ type: 'paragraph', content: [textNode(bullet[1])] }] });
        }
        else {
            flushBullets();
            paragraph.push(line);
        }
    }
    flushParagraph();
    flushBullets();
    return nodes.length ? nodes : [{ type: 'paragraph', content: [textNode(markdown.trim() || ' ')] }];
}
class JiraService {
    config;
    constructor(config) {
        this.config = config;
    }
    getAuthHeaders() {
        const credentials = Buffer.from(`${this.config.jiraEmail}:${this.config.jiraApiToken}`).toString('base64');
        return {
            Authorization: `Basic ${credentials}`,
        };
    }
    async fetchJiraJson(url, errorMessage) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...this.getAuthHeaders(),
                Accept: 'application/json',
            },
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(text || errorMessage);
        }
        return JSON.parse(text);
    }
    toJiraIssue(issue) {
        return {
            id: issue?.key || '',
            summary: issue?.fields?.summary || '',
            status: issue?.fields?.status?.name || '',
            priority: issue?.fields?.priority?.name || '',
        };
    }
    async createIssue(summary, description) {
        const fields = {
            description: {
                content: markdownToAdf(description),
                type: 'doc',
                version: 1,
            },
            issuetype: { id: this.config.jiraIssueTypeId },
            project: { id: this.config.jiraProjectId },
            summary,
        };
        if (this.config.jiraAssigneeId) {
            fields.assignee = { accountId: this.config.jiraAssigneeId };
        }
        const requestBody = {
            fields,
            update: {},
        };
        const response = await fetch(`https://${this.config.jiraDomain}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                ...this.getAuthHeaders(),
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(text || 'Failed to create Jira issue.');
        }
        const data = JSON.parse(text);
        if (!data.key) {
            throw new Error('Failed to extract issue key from Jira response.');
        }
        return data.key;
    }
    browseUrl(issueKey) {
        return `https://${this.config.jiraDomain}/browse/${issueKey}`;
    }
    async getIssue(issueId) {
        const data = await this.fetchJiraJson(`https://${this.config.jiraDomain}/rest/api/3/issue/${issueId}?fields=summary,status,priority`, 'Failed to fetch Jira issue.');
        return this.toJiraIssue(data);
    }
    async getOpenIssues(jiraEmail, jiraAssigneeId) {
        const assignee = jiraAssigneeId ? `"${jiraAssigneeId}"` : `"${jiraEmail}"`;
        const jql = `assignee = ${assignee} AND resolution = Unresolved AND status in ("Open","Reopened", "To Do", "In Progress") ORDER BY created ASC`;
        const response = await fetch(`https://${this.config.jiraDomain}/rest/api/3/search/jql`, {
            method: 'POST',
            headers: {
                ...this.getAuthHeaders(),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jql: jql,
                fields: ['summary', 'status'],
                maxResults: 100,
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Failed to fetch open issues via search/jql.');
        }
        const data = await response.json();
        return data.issues?.map((issue) => this.toJiraIssue(issue)) || [];
    }
}
exports.JiraService = JiraService;
//# sourceMappingURL=jira.js.map