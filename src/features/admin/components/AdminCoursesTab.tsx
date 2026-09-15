import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle, Clock, Download, Eye, Link as LinkIcon, Plus, Search, Trash2, Upload,
} from "lucide-react";

// Courses tab of the admin dashboard, lifted verbatim out of Admin.tsx.
// Purely presentational: Supabase writes, storage uploads and CSV export stay
// in the page; this component only renders the create form and the course list.

export interface CourseFormData {
  title: string;
  description: string;
  price: string;
  grade: string;
  startDate: string;
  endDate: string;
}

export type ThumbnailMode = "file" | "url";

interface AdminCoursesTabProps {
  // create form
  newCourse: CourseFormData;
  onNewCourseChange: (data: CourseFormData) => void;
  isCreatingCourse: boolean;
  onCreateCourse: () => void;
  thumbnailFile: File | null;
  onThumbnailFileChange: (file: File | null) => void;
  courseThumbnailUrl: string;
  onCourseThumbnailUrlChange: (value: string) => void;
  courseThumbnailMode: ThumbnailMode;
  onCourseThumbnailModeChange: (mode: ThumbnailMode) => void;
  // list
  courses: any[];
  search: string;
  onSearchChange: (value: string) => void;
  onExport: () => void;
  // inline edit
  editingCourseId: number | null;
  editCourseData: CourseFormData;
  onEditCourseDataChange: (data: CourseFormData) => void;
  editThumbnailFile: File | null;
  onEditThumbnailFileChange: (file: File | null) => void;
  editThumbnailUrl: string;
  onEditThumbnailUrlChange: (value: string) => void;
  editThumbnailMode: ThumbnailMode;
  onEditThumbnailModeChange: (mode: ThumbnailMode) => void;
  onEditCourse: (course) => void;
  onSaveCourseEdit: () => void;
  onCancelEdit: () => void;
  onDeleteCourse: (id: number) => void;
}

function AdminCoursesTabImpl({
  newCourse,
  onNewCourseChange,
  isCreatingCourse,
  onCreateCourse,
  thumbnailFile,
  onThumbnailFileChange,
  courseThumbnailUrl,
  onCourseThumbnailUrlChange,
  courseThumbnailMode,
  onCourseThumbnailModeChange,
  courses,
  search,
  onSearchChange,
  onExport,
  editingCourseId,
  editCourseData,
  onEditCourseDataChange,
  editThumbnailFile,
  onEditThumbnailFileChange,
  editThumbnailUrl,
  onEditThumbnailUrlChange,
  editThumbnailMode,
  onEditThumbnailModeChange,
  onEditCourse,
  onSaveCourseEdit,
  onCancelEdit,
  onDeleteCourse,
}: AdminCoursesTabProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>Create Course</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Title</Label><Input value={newCourse.title} onChange={(e) => onNewCourseChange({ ...newCourse, title: e.target.value })} placeholder="Class 10 Science" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={newCourse.description} onChange={(e) => onNewCourseChange({ ...newCourse, description: e.target.value })} placeholder="Details..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" value={newCourse.price} onChange={(e) => onNewCourseChange({ ...newCourse, price: e.target.value })} placeholder="499" /></div>
            <div className="space-y-2"><Label>Grade</Label><Input value={newCourse.grade} onChange={(e) => onNewCourseChange({ ...newCourse, grade: e.target.value })} placeholder="10" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={newCourse.startDate} onChange={(e) => onNewCourseChange({ ...newCourse, startDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>End Date</Label><Input type="date" value={newCourse.endDate} onChange={(e) => onNewCourseChange({ ...newCourse, endDate: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Course Thumbnail</Label>
            <div className="flex gap-2 mb-2">
              <Button type="button" size="sm" variant={courseThumbnailMode === "file" ? "default" : "outline"} onClick={() => onCourseThumbnailModeChange("file")}>
                <Upload className="h-3 w-3 mr-1" /> Upload
              </Button>
              <Button type="button" size="sm" variant={courseThumbnailMode === "url" ? "default" : "outline"} onClick={() => onCourseThumbnailModeChange("url")}>
                <LinkIcon className="h-3 w-3 mr-1" /> URL
              </Button>
            </div>
            {courseThumbnailMode === "file" ? (
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input type="file" accept="image/*" onChange={(e) => onThumbnailFileChange(e.target.files?.[0] || null)} className="hidden" id="thumbnail-upload" />
                <label htmlFor="thumbnail-upload" className="cursor-pointer">
                  {thumbnailFile ? (
                    <div className="flex items-center justify-center gap-2 text-green-600"><Eye className="h-5 w-5" /><span className="font-medium text-sm">{thumbnailFile.name}</span></div>
                  ) : (
                    <div className="text-muted-foreground text-sm"><Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" /><p>Click to upload thumbnail image</p></div>
                  )}
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={courseThumbnailUrl}
                  onChange={(e) => onCourseThumbnailUrlChange(e.target.value)}
                />
                {courseThumbnailUrl && (
                  <img src={courseThumbnailUrl} alt="Preview" className="h-20 w-auto rounded-lg object-cover border" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
              </div>
            )}
          </div>
          <Button className="w-full" onClick={onCreateCourse} disabled={isCreatingCourse}>
            {isCreatingCourse ? <Clock className="animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />} Create Course
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Course List</CardTitle>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search courses..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[350px]">
            <div className="space-y-3">
              {courses.map((c) => (
                <div key={c.id} className="p-3 border rounded-lg bg-card space-y-2">
                  {editingCourseId === c.id ? (
                    <div className="space-y-2">
                      <Input value={editCourseData.title} onChange={(e) => onEditCourseDataChange({ ...editCourseData, title: e.target.value })} placeholder="Title" />
                      <Textarea value={editCourseData.description} onChange={(e) => onEditCourseDataChange({ ...editCourseData, description: e.target.value })} placeholder="Description" rows={2} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={editCourseData.price} onChange={(e) => onEditCourseDataChange({ ...editCourseData, price: e.target.value })} placeholder="Price" type="number" />
                        <Input value={editCourseData.grade} onChange={(e) => onEditCourseDataChange({ ...editCourseData, grade: e.target.value })} placeholder="Grade" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={editCourseData.startDate} onChange={(e) => onEditCourseDataChange({ ...editCourseData, startDate: e.target.value })} /></div>
                        <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={editCourseData.endDate} onChange={(e) => onEditCourseDataChange({ ...editCourseData, endDate: e.target.value })} /></div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Thumbnail</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant={editThumbnailMode === "file" ? "default" : "outline"} onClick={() => onEditThumbnailModeChange("file")}>
                            <Upload className="h-3 w-3 mr-1" /> Upload
                          </Button>
                          <Button type="button" size="sm" variant={editThumbnailMode === "url" ? "default" : "outline"} onClick={() => onEditThumbnailModeChange("url")}>
                            <LinkIcon className="h-3 w-3 mr-1" /> URL
                          </Button>
                        </div>
                        {editThumbnailMode === "file" ? (
                          <div className="border border-dashed rounded p-2 text-center">
                            <input type="file" accept="image/*" onChange={(e) => onEditThumbnailFileChange(e.target.files?.[0] || null)} className="hidden" id={`edit-thumb-${c.id}`} />
                            <label htmlFor={`edit-thumb-${c.id}`} className="cursor-pointer text-xs text-muted-foreground">
                              {editThumbnailFile ? editThumbnailFile.name : (c.thumbnail_url ? "Change thumbnail" : "Upload thumbnail")}
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Input placeholder="https://example.com/image.jpg" value={editThumbnailUrl} onChange={(e) => onEditThumbnailUrlChange(e.target.value)} />
                            {editThumbnailUrl && (
                              <img src={editThumbnailUrl} alt="Thumbnail preview" className="h-20 w-auto rounded-lg object-cover border" onError={(e) => (e.currentTarget.style.display = "none")} />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={onSaveCourseEdit}><CheckCircle className="h-3 w-3 mr-1" /> Save</Button>
                        <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div><p className="font-semibold">{c.title}</p><p className="text-xs text-muted-foreground">₹{c.price} • Grade {c.grade}</p></div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="text-blue-500 hover:bg-blue-50" onClick={() => onEditCourse(c)}><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => onDeleteCourse(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {courses.length === 0 && <p className="text-center text-muted-foreground py-10">No courses found.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export const AdminCoursesTab = memo(AdminCoursesTabImpl);
