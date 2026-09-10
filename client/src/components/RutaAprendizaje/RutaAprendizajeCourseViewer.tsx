import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import {
    ChevronLeft,
    CheckCircle,
    Circle,
    PlayCircle,
    FileText,
    Trophy,
    BookOpen,
    Edit
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AttachmentViewer } from '~/components/Common/Attachments';

export default function RutaAprendizajeCourseViewer() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToastContext();
    const { user } = useAuthContext();
    const ADMIN_EMAILS = ['cristhian@mauricioposadac.com', 'mauricioposadac@gmail.com', 'felix.bedoya15@gmail.com'];
    const isAdmin = user?.role === 'ADMIN' || (!!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    const isProOrAdmin = isAdmin || user?.role === 'USER_PRO' || user?.role === 'USER_CUSTOM' || Boolean(user?.isSubUser);
    const [course, setCourse] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(true);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchCourse = async () => {
            try {
                const response = await axios.get(`/api/ruta-aprendizaje/admin/courses/${courseId}`);
                const data = response.data;
                if (data.lessons) {
                    data.lessons.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
                }
                setCourse(data);

                if (data.lessons && data.lessons.length > 0) {
                    setActiveLessonId(data.lessons[0]._id);
                }
            } catch (error) {
                console.error('Error fetching course:', error);
                showToast({ message: 'Error al cargar los detalles del curso.', status: 'error' });
                navigate('/academia?tab=rutas');
            } finally {
                setLoading(false);
            }
        };

        if (courseId) {
            fetchCourse();
        }
    }, [courseId, navigate, showToast]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[50vh] bg-surface-primary text-text-primary">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#10b981]"></div>
            </div>
        );
    }

    if (!course) return null;

    const activeLesson = course.lessons?.find((l: any) => l._id === activeLessonId);

    return (
        <div className="flex flex-col h-full bg-surface-primary text-text-primary overflow-hidden">
            {/* Top Navigation Bar */}
            <div className="flex-none h-14 bg-surface-secondary border-b border-light flex items-center justify-between px-4 sticky top-0 z-20">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <button
                        onClick={() => navigate('/academia?tab=rutas')}
                        className="rounded-full p-2 hover:bg-surface-tertiary transition-colors shrink-0"
                        aria-label="Volver a Academia"
                    >
                        <ChevronLeft className="h-6 w-6 text-text-primary dark:text-gray-300" />
                    </button>
                    <div className="h-6 w-px bg-light mx-1 hidden md:block shrink-0"></div>
                    <h1 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">
                        {course.title}
                    </h1>
                </div>
                {isProOrAdmin && (
                    <button
                        onClick={() => navigate(`/ruta-aprendizaje/admin/courses/${courseId}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer active:scale-95 shrink-0"
                        title="Editar curso y lecciones"
                    >
                        <Edit className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Editar Curso</span>
                    </button>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Sidebar */}
                <div className={`
                    absolute md:relative z-10 
                    h-full bg-surface-secondary border-r border-light flex flex-col
                    transition-all duration-300 ease-in-out
                    ${sidebarOpen ? 'w-full md:w-80 translate-x-0' : 'w-80 -translate-x-full hidden md:flex md:w-0 md:translate-x-0 md:border-none'}
                `}>
                    <div className="p-4 border-b border-light">
                        <h2 className="font-semibold text-lg mb-1">Contenido del Curso</h2>
                        <p className="text-xs text-secondary">{course.lessons?.length || 0} Lecciones</p>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        <div className="flex flex-col">
                            {course.lessons?.map((lesson: any, index: number) => {
                                const isActive = activeLessonId === lesson._id;

                                return (
                                    <button
                                        key={lesson._id}
                                        onClick={() => {
                                            setActiveLessonId(lesson._id);
                                            if (window.innerWidth < 768) setSidebarOpen(false);
                                        }}
                                        className={`
                                            flex items-start gap-3 p-4 text-left border-b border-light/50 transition-colors
                                            ${isActive ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : 'hover:bg-surface-hover border-l-4 border-l-transparent'}
                                        `}
                                    >
                                        <div className="mt-0.5">
                                            <Circle className={`w-5 h-5 ${isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium leading-snug line-clamp-2 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-primary'}`}>
                                                {index + 1}. {lesson.title}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-secondary">
                                                {lesson.videoUrl ? <PlayCircle className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                                <span>{lesson.videoUrl ? 'Video' : 'Lectura'}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                    <div className="flex-1 overflow-y-auto">
                        {activeLesson ? (
                            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                                <div className="mb-6 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 w-fit px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800 shadow-sm">
                                        <BookOpen className="w-3 h-3" />
                                        Lección {course.lessons.findIndex((l: any) => l._id === activeLesson._id) + 1} de {course.lessons?.length || 0}
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
                                        {activeLesson.title}
                                    </h2>
                                </div>

                                {activeLesson.videoUrl && (
                                    <div className="aspect-video mb-8 bg-black rounded-xl overflow-hidden shadow-lg relative">
                                        {(() => {
                                            let embedUrl = '';
                                            const url = activeLesson.videoUrl;
                                            if (url.includes('youtube.com/watch?v=')) {
                                                const videoId = url.split('v=')[1]?.split('&')[0];
                                                embedUrl = `https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0&iv_load_policy=3`;
                                            } else if (url.includes('youtu.be/')) {
                                                const videoId = url.split('youtu.be/')[1]?.split('?')[0];
                                                embedUrl = `https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0&iv_load_policy=3`;
                                            }

                                            if (embedUrl) {
                                                return (
                                                    <iframe
                                                        src={embedUrl}
                                                        title={activeLesson.title}
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                        allowFullScreen
                                                        className="w-full h-full absolute inset-0 border-0"
                                                    ></iframe>
                                                );
                                            }
                                            return (
                                                <div className="flex items-center justify-center h-full w-full flex-col text-gray-400 absolute inset-0">
                                                    <PlayCircle className="w-16 h-16 mb-4 opacity-50" />
                                                    <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                                        Abrir Video
                                                    </a>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {activeLesson.content && (
                                    <div className="prose prose-blue dark:prose-invert max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {activeLesson.content}
                                        </ReactMarkdown>
                                    </div>
                                )}

                                {/* Lesson Attachments */}
                                {activeLesson.attachments && activeLesson.attachments.length > 0 && (
                                    <div className="mt-8">
                                        <AttachmentViewer
                                            attachments={activeLesson.attachments}
                                            title="Recursos y Archivos de esta Lección"
                                            subtitle="Formatos, guías y documentos específicos de esta lección."
                                        />
                                    </div>
                                )}

                                {/* Course General Attachments */}
                                {course.attachments && course.attachments.length > 0 && (
                                    <div className="mt-6">
                                        <AttachmentViewer
                                            attachments={course.attachments}
                                            title="Recursos Generales del Curso"
                                            subtitle="Material y documentos de consulta para todo el curso."
                                        />
                                    </div>
                                )}

                                {activeLesson.exam?.isEnabled && (
                                    <div className="mt-8 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 flex flex-col items-center text-center">
                                        <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-indigo-100 dark:border-indigo-700">
                                            <span className="text-2xl">📝</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-2">{activeLesson.exam.title || 'Evaluación de Lección'}</h3>
                                        <p className="text-indigo-700 dark:text-indigo-300 max-w-xl mx-auto mb-6">
                                            Como administrador, puedes previsualizar la evaluación de esta lección.
                                        </p>
                                        <button className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium shadow" onClick={() => alert('Los exámenes están habilitados para los trabajadores en el portal público.')}>
                                            Ver Estructura del Examen ({activeLesson.exam.questions?.length || 0} preguntas)
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center text-gray-500">
                                Selecciona una lección para comenzar
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
