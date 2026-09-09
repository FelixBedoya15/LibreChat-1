const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { google } = require('googleapis');
const { logger } = require('@librechat/data-schemas');
const {
  getActiveCompany,
  getScopedAuthValue,
  updateScopedAuthValue,
} = require('~/server/services/googleAuthHelper');

function convertHtmlToMarkdown(html) {
  if (!html) return '';
  let md = html;
  // Replace block tags
  md = md.replace(/<h1>\s*(.*?)\s*<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2>\s*(.*?)\s*<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3>\s*(.*?)\s*<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4>\s*(.*?)\s*<\/h4>/gi, '\n#### $1\n');
  // Replace list items
  md = md.replace(/<li>\s*(.*?)\s*<\/li>/gi, '* $1\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<ul>/gi, '\n');
  md = md.replace(/<ol>/gi, '\n');
  // Replace inline bold
  md = md.replace(/<strong>\s*(.*?)\s*<\/strong>/gi, '**$1**');
  md = md.replace(/<b>\s*(.*?)\s*<\/b>/gi, '**$1**');
  // Replace line breaks and paragraphs
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p>\s*(.*?)\s*<\/p>/gi, '\n$1\n');
  // Remove any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  md = md.replace(/&nbsp;/gi, ' ')
         .replace(/&amp;/gi, '&')
         .replace(/&lt;/gi, '<')
         .replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"')
         .replace(/&#39;/gi, "'");
  // Clean up multiple consecutive newlines
  md = md.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return md.trim();
}

function parseMarkdownForShape(mdText) {
  let processedText = mdText;
  if (/<[a-z][\s\S]*>/i.test(mdText)) {
    processedText = convertHtmlToMarkdown(mdText);
  }
  const lines = processedText.split('\n');
  let cleanText = '';
  const styles = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const isLast = i === lines.length - 1;

    // Detect bullet points (* or -)
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      const prefixIdx = line.indexOf('*') !== -1 ? line.indexOf('*') : line.indexOf('-');
      line = line.substring(0, prefixIdx) + '• ' + line.substring(prefixIdx + 2);
    }

    let cleanLine = '';
    let boldIndex = 0;
    while (true) {
      const startBold = line.indexOf('**', boldIndex);
      if (startBold === -1) {
        cleanLine += line.substring(boldIndex);
        break;
      }
      const endBold = line.indexOf('**', startBold + 2);
      if (endBold === -1) {
        cleanLine += line.substring(boldIndex);
        break;
      }

      cleanLine += line.substring(boldIndex, startBold);
      const boldText = line.substring(startBold + 2, endBold);

      const startInShape = cleanText.length + cleanLine.length;
      const endInShape = startInShape + boldText.length;
      styles.push({ start: startInShape, end: endInShape, type: 'bold' });

      cleanLine += boldText;
      boldIndex = endBold + 2;
    }

    cleanText += cleanLine + (isLast ? '' : '\n');
  }

  return { cleanText, styles };
}

class GoogleSlidesTool extends Tool {
  static lc_name() {
    return 'google_slides';
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'google_slides';
    this.description =
      'Permite interactuar directamente con Google Slides (Presentaciones de Google) del usuario. Puedes crear nuevas presentaciones de diapositivas, añadir diapositivas de texto y título, y leer la estructura de una presentación para armar propuestas de capacitación, informes corporativos o resúmenes de gestión.';
    
    this.req = fields.req;

    this.schema = z.object({
      action: z.enum([
        'create_presentation',
        'add_slide',
        'read_presentation',
      ]).describe('La acción a ejecutar en Google Slides.'),
      presentationId: z.string().optional().describe('El ID de la presentación de Google Slides (requerido para añadir diapositivas o leer la estructura).'),
      title: z.string().optional().describe('El título de la presentación o de la nueva diapositiva que deseas añadir.'),
      bodyText: z.string().optional().describe('El texto del cuerpo o contenido de la nueva diapositiva.'),
      slideLayout: z.enum(['TITLE_AND_BODY', 'TITLE', 'SECTION_HEADER', 'BLANK']).optional().default('BLANK').describe('El diseño de la diapositiva que deseas añadir.'),
      slideType: z.enum(['TITLE_SLIDE', 'CONTENT_SLIDE']).optional().default('CONTENT_SLIDE').describe('El tipo de diapositiva: "TITLE_SLIDE" para portadas con fondo oscuro o "CONTENT_SLIDE" para diapositivas de contenido con fondo claro y línea de acento.'),
    });
  }

  async getAuthClient() {
    if (!this.req || !this.req.user) {
      throw new Error('Petición no autenticada. No se pudo obtener el contexto del usuario.');
    }
    const userId = this.req.user.id;
    const company = await getActiveCompany(userId);
    const companyId = company ? String(company._id) : null;

    const accessToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', true);
    const refreshToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_REFRESH_TOKEN', true);
    const expiryStr = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', true);
    const expiry = Number(expiryStr);

    if (!refreshToken) {
      throw new Error('No se encontró una conexión activa con Google Workspace. Por favor, conecta tu cuenta de Google en la pestaña de Configuración.');
    }

    const serverDomain = (process.env.DOMAIN_SERVER || 'https://wappy.club').replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${serverDomain}/api/google-drive/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiry,
    });

    const isExpired = expiry ? (expiry - Date.now() < 60000) : true;
    if (isExpired) {
      logger.info(`[GoogleSlidesTool] Token expirado para usuario: ${userId}. Refrescando...`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        if (credentials.access_token) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', credentials.access_token);
        }
        if (credentials.expiry_date) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', String(credentials.expiry_date));
        }
        logger.info(`[GoogleSlidesTool] Token refrescado exitosamente.`);
      } catch (err) {
        logger.error(`[GoogleSlidesTool] Error refrescando token:`, err);
        throw new Error('La conexión de Google Workspace ha caducado. Por favor, vuelve a vincular tu cuenta en Configuración.');
      }
    }

    return oauth2Client;
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validación fallida: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { action, presentationId, title, bodyText, slideLayout, slideType } = validationResult.data;
    const auth = await this.getAuthClient();
    const slides = google.slides({ version: 'v1', auth });

    switch (action) {
      case 'create_presentation': {
        if (!title) throw new Error('Se requiere el campo "title" para crear la presentación.');
        const response = await slides.presentations.create({
          requestBody: {
            title,
          },
        });
        return `Presentación de Google Slides creada exitosamente:\n- Título: "${title}"\n- ID: ${response.data.presentationId}\n- Enlace: https://docs.google.com/presentation/d/${response.data.presentationId}/edit`;
      }

      case 'add_slide': {
        if (!presentationId) throw new Error('Se requiere "presentationId" para añadir una diapositiva.');
        
        // Force layout to BLANK to avoid ugly overlapping placeholders
        const activeLayout = 'BLANK';

        const slideId = `slide_${Date.now()}`;
        const titleBoxId = `title_${Date.now()}`;
        const bodyBoxId = `body_${Date.now()}`;
        const dividerId = `divider_${Date.now()}`;

        const requests = [
          {
            createSlide: {
              objectId: slideId,
              slideLayoutReference: {
                predefinedLayout: activeLayout,
              },
            },
          },
        ];

        // Apply background color based on slideType
        if (slideType === 'TITLE_SLIDE') {
          requests.push({
            updatePageProperties: {
              objectId: slideId,
              pageProperties: {
                pageBackgroundFill: {
                  solidFill: {
                    color: {
                      rgbColor: {
                        red: 0.12,  // #1e
                        green: 0.16, // #29
                        blue: 0.23,  // #3b (Dark slate slate-800)
                      },
                    },
                  },
                },
              },
              fields: 'pageBackgroundFill',
            },
          });
        } else {
          // CONTENT_SLIDE background (clean off-white slate-50)
          requests.push({
            updatePageProperties: {
              objectId: slideId,
              pageProperties: {
                pageBackgroundFill: {
                  solidFill: {
                    color: {
                      rgbColor: {
                        red: 0.97,
                        green: 0.98,
                        blue: 0.99,
                      },
                    },
                  },
                },
              },
              fields: 'pageBackgroundFill',
            },
          });
        }

        // TITLE_SLIDE Layout
        if (slideType === 'TITLE_SLIDE') {
          // 1. Centered Title
          if (title) {
            const { cleanText, styles } = parseMarkdownForShape(title);
            requests.push(
              {
                createShape: {
                  objectId: titleBoxId,
                  shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: slideId,
                    size: {
                      height: { magnitude: 100, unit: 'PT' },
                      width: { magnitude: 620, unit: 'PT' },
                    },
                    transform: {
                      scaleX: 1,
                      scaleY: 1,
                      translateX: 50,
                      translateY: 140, // Centered vertically
                      unit: 'PT',
                    },
                  },
                },
              },
              {
                insertText: {
                  objectId: titleBoxId,
                  text: cleanText,
                },
              },
              {
                updateTextStyle: {
                  objectId: titleBoxId,
                  style: {
                    fontSize: { magnitude: 36, unit: 'PT' },
                    bold: true,
                    fontFamily: 'Montserrat',
                    foregroundColor: {
                      opaqueColor: {
                        rgbColor: {
                          red: 1,
                          green: 1,
                          blue: 1, // White
                        },
                      },
                    },
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'fontSize,bold,fontFamily,foregroundColor',
                },
              },
              {
                updateParagraphStyle: {
                  objectId: titleBoxId,
                  style: {
                    alignment: 'CENTER',
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'alignment',
                },
              }
            );

            // Apply bold segments in title
            for (const style of styles) {
              if (style.type === 'bold') {
                requests.push({
                  updateTextStyle: {
                    objectId: titleBoxId,
                    style: {
                      bold: true,
                    },
                    textRange: {
                      type: 'FIXED_RANGE',
                      startIndex: style.start,
                      endIndex: style.end,
                    },
                    fields: 'bold',
                  },
                });
              }
            }
          }

          // 2. Centered Subtitle
          if (bodyText) {
            const { cleanText, styles } = parseMarkdownForShape(bodyText);
            requests.push(
              {
                createShape: {
                  objectId: bodyBoxId,
                  shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: slideId,
                    size: {
                      height: { magnitude: 80, unit: 'PT' },
                      width: { magnitude: 620, unit: 'PT' },
                    },
                    transform: {
                      scaleX: 1,
                      scaleY: 1,
                      translateX: 50,
                      translateY: 250, // Separated from title
                      unit: 'PT',
                    },
                  },
                },
              },
              {
                insertText: {
                  objectId: bodyBoxId,
                  text: cleanText,
                },
              },
              {
                updateTextStyle: {
                  objectId: bodyBoxId,
                  style: {
                    fontSize: { magnitude: 18, unit: 'PT' },
                    fontFamily: 'Montserrat',
                    foregroundColor: {
                      opaqueColor: {
                        rgbColor: {
                          red: 0.49,
                          green: 0.83,
                          blue: 0.98, // Light Teal/Blue #7dd3fc
                        },
                      },
                    },
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'fontSize,fontFamily,foregroundColor',
                },
              },
              {
                updateParagraphStyle: {
                  objectId: bodyBoxId,
                  style: {
                    alignment: 'CENTER',
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'alignment',
                },
              }
            );

            // Apply bold segments in subtitle
            for (const style of styles) {
              if (style.type === 'bold') {
                requests.push({
                  updateTextStyle: {
                    objectId: bodyBoxId,
                    style: {
                      bold: true,
                    },
                    textRange: {
                      type: 'FIXED_RANGE',
                      startIndex: style.start,
                      endIndex: style.end,
                    },
                    fields: 'bold',
                  },
                });
              }
            }
          }
        }
        // CONTENT_SLIDE Layout
        else {
          // 1. Left-aligned Title (Teal Montserrat)
          if (title) {
            const { cleanText, styles } = parseMarkdownForShape(title);
            requests.push(
              {
                createShape: {
                  objectId: titleBoxId,
                  shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: slideId,
                    size: {
                      height: { magnitude: 50, unit: 'PT' },
                      width: { magnitude: 620, unit: 'PT' },
                    },
                    transform: {
                      scaleX: 1,
                      scaleY: 1,
                      translateX: 50,
                      translateY: 40,
                      unit: 'PT',
                    },
                  },
                },
              },
              {
                insertText: {
                  objectId: titleBoxId,
                  text: cleanText,
                },
              },
              {
                updateTextStyle: {
                  objectId: titleBoxId,
                  style: {
                    fontSize: { magnitude: 24, unit: 'PT' },
                    bold: true,
                    fontFamily: 'Montserrat',
                    foregroundColor: {
                      opaqueColor: {
                        rgbColor: {
                          red: 0.06,
                          green: 0.46,
                          blue: 0.43, // Teal #0f766e
                        },
                      },
                    },
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'fontSize,bold,fontFamily,foregroundColor',
                },
              }
            );

            // Apply bold segments in title
            for (const style of styles) {
              if (style.type === 'bold') {
                requests.push({
                  updateTextStyle: {
                    objectId: titleBoxId,
                    style: {
                      bold: true,
                    },
                    textRange: {
                      type: 'FIXED_RANGE',
                      startIndex: style.start,
                      endIndex: style.end,
                    },
                    fields: 'bold',
                  },
                });
              }
            }
          }

          // 2. Horizontal Accent Line (Teal)
          requests.push(
            {
              createShape: {
                objectId: dividerId,
                shapeType: 'RECTANGLE',
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    height: { magnitude: 3, unit: 'PT' },
                    width: { magnitude: 620, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: 50,
                    translateY: 95,
                    unit: 'PT',
                  },
                },
              },
            },
            {
              updateShapeProperties: {
                objectId: dividerId,
                shapeProperties: {
                  shapeBackgroundFill: {
                    solidFill: {
                      color: {
                        rgbColor: {
                          red: 0.06,
                          green: 0.46,
                          blue: 0.43, // Teal
                        },
                      },
                    },
                  },
                  outline: {
                    outlineFill: {
                      solidFill: {
                        color: {
                          rgbColor: {
                            red: 0.06,
                            green: 0.46,
                            blue: 0.43,
                          },
                        },
                      },
                    },
                  },
                },
                fields: 'shapeBackgroundFill,outline',
              },
            }
          );

          // 3. Body text box (Dark Grey Arial)
          if (bodyText) {
            const { cleanText, styles } = parseMarkdownForShape(bodyText);
            requests.push(
              {
                createShape: {
                  objectId: bodyBoxId,
                  shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: slideId,
                    size: {
                      height: { magnitude: 250, unit: 'PT' },
                      width: { magnitude: 620, unit: 'PT' },
                    },
                    transform: {
                      scaleX: 1,
                      scaleY: 1,
                      translateX: 50,
                      translateY: 120, // Clean separation from header and divider
                      unit: 'PT',
                    },
                  },
                },
              },
              {
                insertText: {
                  objectId: bodyBoxId,
                  text: cleanText,
                },
              },
              {
                updateTextStyle: {
                  objectId: bodyBoxId,
                  style: {
                    fontSize: { magnitude: 14, unit: 'PT' },
                    fontFamily: 'Arial',
                    foregroundColor: {
                      opaqueColor: {
                        rgbColor: {
                          red: 0.2,
                          green: 0.2,
                          blue: 0.2, // Dark grey
                        },
                      },
                    },
                  },
                  textRange: {
                    type: 'ALL',
                  },
                  fields: 'fontSize,fontFamily,foregroundColor',
                },
              }
            );

            // Apply bold segments in bodyText
            for (const style of styles) {
              if (style.type === 'bold') {
                requests.push({
                  updateTextStyle: {
                    objectId: bodyBoxId,
                    style: {
                      bold: true,
                    },
                    textRange: {
                      type: 'FIXED_RANGE',
                      startIndex: style.start,
                      endIndex: style.end,
                    },
                    fields: 'bold',
                  },
                });
              }
            }
          }
        }

        await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests,
          },
        });

        return `Diapositiva añadida exitosamente con diseño "${activeLayout}" y tipo "${slideType}" a la presentación.`;
      }

      case 'read_presentation': {
        if (!presentationId) throw new Error('Se requiere "presentationId" para leer.');
        const response = await slides.presentations.get({
          presentationId,
        });

        const slidesData = response.data.slides || [];
        let info = `Presentación: "${response.data.title}" (${slidesData.length} diapositivas encontradas):\n\n`;

        slidesData.forEach((slide, idx) => {
          info += `Diapositiva ${idx + 1} (ID: ${slide.objectId}):\n`;
          const elements = slide.pageElements || [];
          elements.forEach(elem => {
            if (elem.shape && elem.shape.text && elem.shape.text.textElements) {
              const textRuns = elem.shape.text.textElements
                .map(te => te.textRun?.content)
                .filter(Boolean)
                .join('')
                .trim();
              if (textRuns) {
                info += ` - Texto: "${textRuns}"\n`;
              }
            }
          });
        });

        return info;
      }

      default:
        throw new Error(`Acción desconocida: ${action}`);
    }
  }
}

module.exports = GoogleSlidesTool;
