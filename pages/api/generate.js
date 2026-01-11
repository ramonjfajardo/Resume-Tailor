import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

// Cache template compilation - support multiple templates
const templateCache = new Map();
const TEMPLATE_OPTIONS = {
  'template1': 'Resume_Template1.html',
  'template2': 'Resume_Template2.html',
  'template3': 'Resume_Template3.html',
  'template4': 'Resume_Template4.html',
  'template5': 'Resume_Template5.html',
  'template6': 'Resume_Template6.html',
  'template7': 'Resume_Template7.html',
  'template8': 'Resume_Template8.html',
  'template9': 'Resume_Template9.html',
  'template10': 'Resume_Template10.html'
};

// Register Handlebars helpers (idempotent, safe to call multiple times)
Handlebars.registerHelper('formatKey', function(key) {
  return key;
});

Handlebars.registerHelper('join', function(array, separator) {
  if (Array.isArray(array)) {
    return array.join(separator);
  }
  return '';
});

const getTemplate = (templateName = 'template1') => {
  // Validate template name
  if (!TEMPLATE_OPTIONS[templateName]) {
    templateName = 'template1';
  }
  
  // Return cached template if available
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }
  
  // Load and compile template
  const templateFile = TEMPLATE_OPTIONS[templateName];
  const templatePath = path.join(process.cwd(), "templates", templateFile);
  
  if (!fs.existsSync(templatePath)) {
    console.warn(`Template ${templateFile} not found, using template1`);
    return getTemplate('template1');
  }
  
  const templateSource = fs.readFileSync(templatePath, "utf-8");
  const compiledTemplate = Handlebars.compile(templateSource);
  
  // Cache the compiled template
  templateCache.set(templateName, compiledTemplate);
  
  return compiledTemplate;
};

// Cache profile data in memory to avoid repeated file reads
const profileCache = new Map();

const loadProfile = (profileName) => {
  if (profileCache.has(profileName)) {
    return profileCache.get(profileName);
  }
  
  const profilePath = path.join(process.cwd(), "resumes", `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  
  const profileData = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
  profileCache.set(profileName, profileData);
  return profileData;
};


export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { profile, jd, company, role, template = 'default' } = req.body;

    if (!profile) return res.status(400).send("Profile required");
    if (!jd) return res.status(400).send("Completed resume JSON required");
    if (!company) return res.status(400).send("Company name required");
    if (!role) return res.status(400).send("Role name required");

    // Load profile JSON (using cache)
    console.log(`Loading profile: ${profile}`);
    const profileData = loadProfile(profile);
    
    if (!profileData) {
      return res.status(404).send(`Profile "${profile}" not found`);
    }

    // Parse the completed resume JSON from the jd field
    console.log("Parsing completed resume JSON...");
    
    let content = jd.trim();
    
    // Remove markdown code blocks if present
    content = content
      .replace(/```(?:json|javascript)?\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    
    // Extract JSON object boundaries
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    } else {
      console.error("No JSON object found in input");
      throw new Error("Invalid JSON format. Please provide valid JSON with title, summary, skills, and experience fields.");
    }
    
    // Parse JSON with error handling
    let resumeContent;
    try {
      resumeContent = JSON.parse(content);
    } catch (parseError) {
      console.error("=== JSON PARSE ERROR ===");
      console.error("Parse error:", parseError.message);
      console.error("Content length:", content.length);
      console.error("First 500 chars:", content.substring(0, 500));
      
      // Try to fix common JSON issues
      try {
        let fixedContent = content
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/,\s*,/g, ','); // Remove double commas
        resumeContent = JSON.parse(fixedContent);
        console.log("✅ Successfully parsed after fixing common issues");
      } catch (secondError) {
        console.error("Failed to parse even after fixes");
        throw new Error(`Invalid JSON format: ${parseError.message}. Please check your JSON syntax.`);
      }
    }
    
    // Validate required fields
    if (!resumeContent.title || !resumeContent.summary || !resumeContent.skills || !resumeContent.experience) {
      console.error("Missing required fields in JSON:", Object.keys(resumeContent));
      throw new Error("JSON missing required fields (title, summary, skills, or experience)");
    }

    console.log("✅ Resume JSON parsed successfully");
    console.log("Skills categories:", Object.keys(resumeContent.skills).length);
    console.log("Experience entries:", resumeContent.experience.length);
    
    // Debug: Check if experience has details
    resumeContent.experience.forEach((exp, idx) => {
      console.log(`Experience ${idx + 1}: ${exp.title || 'NO TITLE'} - Details count: ${exp.details?.length || 0}`);
      if (!exp.details || exp.details.length === 0) {
        console.warn(`⚠️ WARNING: Experience entry ${idx + 1} has NO DETAILS!`);
      }
    });

    // Get cached template (compiled once, reused)
    const compiledTemplate = getTemplate(template);
    console.log(`Using template: ${template}`);

    // Prepare data for template
    const templateData = {
      name: profileData.name,
      title: resumeContent.title,
      email: profileData.email,
      phone: profileData.phone,
      location: profileData.location,
      linkedin: profileData.linkedin,
      website: profileData.website,
      summary: resumeContent.summary,
      skills: resumeContent.skills,
      experience: profileData.experience.map((job, idx) => ({
        title: job.title || resumeContent.experience[idx]?.title || "Engineer",
        company: job.company,
        location: job.location,
        start_date: job.start_date,
        end_date: job.end_date,
        details: resumeContent.experience[idx]?.details || []
      })),
      education: profileData.education
    };

    // Render HTML
    const html = compiledTemplate(templateData);
    console.log("HTML rendered from template");

    // Generate PDF with Puppeteer (optimized)
    // Check if running on Vercel (serverless environment)
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
    const isProduction = process.env.NODE_ENV === 'production';
    const isServerless = isVercel || isProduction;
    
    let browser;
    if (isServerless) {
      // Optimized chromium args for faster startup in serverless
      const optimizedArgs = [
        ...chromium.args,
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ];
      
      browser = await puppeteerCore.launch({
        args: optimizedArgs,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    } else {
      // Local development with optimized settings
      browser = await puppeteer.launch({ 
        headless: "new",
        args: [
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox'
        ]
      });
    }

    const page = await browser.newPage();
    // Use 'load' instead of 'networkidle0' - much faster since we have no external resources
    await page.setContent(html, { waitUntil: "load" });
    
    // Generate PDF with optimized settings
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { 
        top: "15mm", 
        bottom: "15mm", 
        left: "0mm", 
        right: "0mm" 
      },
      preferCSSPageSize: false, // Faster rendering
    });
    
    await browser.close();

    console.log("PDF generated successfully!");
    
    // Generate filename from profile name, company and role
    // Move sanitize function outside to avoid recreation (though it's only called 3 times)
    const sanitizeFilename = (str) => str.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const filename = `${sanitizeFilename(profileData.name)}_${sanitizeFilename(company)}_${sanitizeFilename(role)}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(pdfBuffer);
    

  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("PDF generation failed: " + err.message);
  }
}
