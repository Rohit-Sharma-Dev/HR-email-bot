const fs = require('fs');
const path = require('path');

const OPT_OUT_FOOTER = "\n\n---\nIf you prefer not to receive future emails, simply reply with 'unsubscribe' and I will remove you right away.";

function getTemplateFileName(stage, roleCategory = '') {
  const stageLower = (stage || '').toLowerCase();
  
  if (stageLower === 'initial') {
    const roleLower = (roleCategory || '').toLowerCase();
    if (roleLower.includes('front')) {
      return 'frontend-initial.txt';
    } else if (roleLower.includes('back')) {
      return 'backend-initial.txt';
    } else {
      return 'fullstack-initial.txt';
    }
  } else if (stageLower === 'followup1') {
    return 'followup1.txt';
  } else if (stageLower === 'followup2') {
    return 'followup2.txt';
  }

  throw new Error(`Unsupported email stage: ${stage}`);
}

function getResumeAttachmentPath(roleCategory = '') {
  const roleLower = (roleCategory || '').toLowerCase();
  let baseName = 'fullstack-resume';
  if (roleLower.includes('front')) {
    baseName = 'frontend-resume';
  } else if (roleLower.includes('back')) {
    baseName = 'backend-resume';
  }

  const extensions = ['.pdf', '.docx', '.doc'];
  const resumesDir = path.join(__dirname, '..', 'resumes');

  for (const ext of extensions) {
    const fullPath = path.join(resumesDir, baseName + ext);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function renderTemplate(stage, roleCategory, data = {}) {
  const templateFileName = getTemplateFileName(stage, roleCategory);
  const templatePath = path.join(__dirname, '..', 'templates', templateFileName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at path: ${templatePath}`);
  }

  let rawContent = fs.readFileSync(templatePath, 'utf8');

  // Replace placeholders: {{name}}, {{company}}, {{role}}
  const name = data.name || 'Hiring Manager';
  const company = data.company || 'your company';
  const role = data.role || roleCategory || 'Software Engineer';

  let processedContent = rawContent
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{company\}\}/g, company)
    .replace(/\{\{role\}\}/g, role);

  // Extract Subject line if present
  let subject = 'Career Opportunities';
  let body = processedContent;

  const subjectMatch = processedContent.match(/^Subject:\s*(.*)\r?\n/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    body = processedContent.substring(subjectMatch[0].length).trim();
  }

  // Ensure opt-out footer is attached
  if (!body.includes('unsubscribe')) {
    body += OPT_OUT_FOOTER;
  }

  // Determine resume attachment path for initial outreach or general dispatches
  const attachmentPath = getResumeAttachmentPath(roleCategory);

  return {
    templateName: templateFileName,
    subject: subject,
    body: body,
    attachmentPath: attachmentPath
  };
}

module.exports = {
  renderTemplate,
  getTemplateFileName,
  getResumeAttachmentPath
};
