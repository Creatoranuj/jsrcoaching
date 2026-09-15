import { useBatch } from "../../contexts/BatchContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/select";
import { formatGrade } from "../../lib/formatGrade";

const BatchSelector = () => {
  const { batches, selectedBatch, setSelectedBatch, loading } = useBatch();

  if (loading || batches.length === 0) return null;

  const selectedGrade = formatGrade(selectedBatch?.grade);

  return (
    <div className="w-full min-w-0">
      <Select
        value={selectedBatch?.id.toString() || ""}
        onValueChange={(val) => {
          const batch = batches.find((b) => b.id.toString() === val);
          if (batch) setSelectedBatch(batch);
        }}
      >
        <SelectTrigger className="w-full min-w-0 bg-card border border-border rounded-xl h-12 pl-4 pr-3 text-sm sm:text-base font-semibold text-foreground shadow-sm">
          <div className="flex flex-1 min-w-0 items-center gap-2.5 overflow-hidden text-left">
            {selectedBatch?.image_url && (
              <img
                src={selectedBatch.image_url}
                alt=""
                className="h-7 w-7 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <span className="block flex-1 min-w-0 truncate">
              {selectedBatch?.title || "Select Batch"}
              {selectedGrade && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({selectedGrade})
                </span>
              )}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)]">
          {batches.map((batch) => {
            const grade = formatGrade(batch.grade);
            return (
              <SelectItem key={batch.id} value={batch.id.toString()}>
                <div className="flex min-w-0 items-center gap-2.5">
                  {batch.image_url && (
                    <img
                      src={batch.image_url}
                      alt=""
                      className="h-6 w-6 rounded-md object-cover flex-shrink-0"
                    />
                  )}
                  <span className="min-w-0 truncate">
                    {batch.title}
                    {grade && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        ({grade})
                      </span>
                    )}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

export default BatchSelector;
