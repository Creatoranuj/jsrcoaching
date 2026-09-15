/**
 * Materials.tsx - Unified Library page
 * Combines materials, notes, and lesson PDFs into one searchable view.
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useMaterials } from "../hooks/useMaterials";
import { useCourses } from "../hooks/useCourses";
import { useAuth } from "../contexts/AuthContext";
import UniversalFileViewer from "../components/library/UniversalFileViewer";
import { isGoogleDrive, isGoogleDocs, isNotion } from "../lib/pdfViewerUrl";

import { 
  FileText, Download, Upload, Loader2, 
  Trash2, File, FileImage, FileVideo, Plus, Search, FileSpreadsheet, Eye
} from "lucide-react";

const Materials = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  // Screen protection intentionally not applied here; only LessonView blocks recording for students.
  const { isAuthenticated, isAdmin, isTeacher, isLoading: authLoading } = useAuth();
  const { materials, loading, uploading, uploadMaterial, deleteMaterial } = useMaterials();
  const { courses } = useCourses();
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterType, setFilterType] = useState("all");
  
  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<(typeof materials)[number] | null>(null);

  const canManage = isAdmin || isTeacher;

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (searchQuery && !m.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCourse !== "all" && String(m.courseId) !== filterCourse) return false;
      if (filterType !== "all" && m.fileType !== filterType) return false;
      return true;
    });
  }, [materials, searchQuery, filterCourse, filterType]);

  const handleUpload = async () => {
    if (!title || !file) return;
    const success = await uploadMaterial({
      title,
      courseId: selectedCourse ? parseInt(selectedCourse) : undefined,
      file,
    });
    if (success) {
      setShowUpload(false);
      setTitle("");
      setSelectedCourse("");
      setFile(null);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].some(t => fileType.includes(t))) return <FileImage className="h-5 w-5 text-green-500" />;
    if (['mp4', 'webm', 'mov'].some(t => fileType.includes(t))) return <FileVideo className="h-5 w-5 text-blue-500" />;
    if (['xlsx', 'xls', 'csv', 'spreadsheet'].some(t => fileType.includes(t))) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    if (['notes', 'dpp'].includes(fileType)) return <FileText className="h-5 w-5 text-purple-500" />;
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPreviewable = (url: string) => {
    return /\.(pdf|xlsx|xls|csv)($|\?)/i.test(url) || isGoogleDrive(url) || isGoogleDocs(url) || isNotion(url);
  };

  // Navigation must happen in an effect — calling navigate() during render
  // causes "cannot update a component while rendering a different component" warnings.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);
  if (!authLoading && !isAuthenticated) return null;

  if (previewMaterial) {
    return (
      <UniversalFileViewer
        url={previewMaterial.fileUrl}
        title={previewMaterial.title}
        filename={previewMaterial.title}
        fileType={previewMaterial.fileType}
        itemId={previewMaterial.id}
        source={previewMaterial.source === "material" ? "library" : "attachment"}
        onBack={() => setPreviewMaterial(null)}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="bg-primary px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton tone="onPrimary" />
          <h1 className="text-lg font-semibold text-primary-foreground">Library</h1>
          <Badge variant="secondary" className="bg-accent text-accent-foreground">{materials.length}</Badge>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload
          </Button>
        )}
      </div>

      <main className="flex-1 p-4 space-y-4">
        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search materials..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="notes">Notes</SelectItem>
              <SelectItem value="dpp">DPP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Upload Form */}
        {showUpload && canManage && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Upload Material
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="Material title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Course (Optional)</Label>
                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                  <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id.toString()}>{course.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <input type="file" id="file-upload" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    {file ? <p className="text-primary font-medium">{file.name}</p> : <p className="text-muted-foreground">Click to select file</p>}
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowUpload(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleUpload} disabled={uploading || !title || !file} className="flex-1">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Materials Grid */}
        {loading ? (
          <div className="py-12 text-center flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading materials…</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{searchQuery || filterCourse !== "all" || filterType !== "all" ? "No materials match your filters" : "No materials available yet"}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMaterials.map((material) => (
              <Card key={material.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-lg bg-muted">{getFileIcon(material.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{material.title}</h4>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {material.course && (
                          <Badge variant="outline" className="text-xs">{material.course.title}</Badge>
                        )}
                        {material.source !== "material" && (
                          <Badge variant="secondary" className="text-xs capitalize">{material.source}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatSize(material.fileSize)}{material.fileSize ? ' • ' : ''}{material.fileType.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {isPreviewable(material.fileUrl) && (
                      <Button variant="outline" size="sm" onClick={() => setPreviewMaterial(material)}>
                        <Eye className="h-4 w-4 mr-1" /> Preview
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={material.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-1" /> Download
                      </a>
                    </Button>
                    {canManage && material.source === "material" && (
                      <Button variant="ghost" size="sm" onClick={() => deleteMaterial(material.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Materials;
